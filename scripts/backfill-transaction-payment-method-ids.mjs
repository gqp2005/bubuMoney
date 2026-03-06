import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function resolveProjectId() {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    null
  );
}

function normalizeName(value) {
  return String(value ?? "").trim();
}

function parseArgs(argv) {
  const result = {
    householdId: null,
    dryRun: false,
    manualMappings: new Map(),
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (arg.startsWith("--householdId=")) {
      result.householdId = arg.slice("--householdId=".length).trim() || null;
      continue;
    }
    if (arg.startsWith("--map=")) {
      const rawValue = arg.slice("--map=".length);
      const separatorIndex = rawValue.indexOf("=");
      if (separatorIndex <= 0 || separatorIndex === rawValue.length - 1) {
        throw new Error(
          `Invalid --map argument: ${arg}. Use --map=\"old name=paymentMethodId\"`
        );
      }
      const legacyName = normalizeName(rawValue.slice(0, separatorIndex));
      const paymentMethodId = normalizeName(rawValue.slice(separatorIndex + 1));
      result.manualMappings.set(legacyName, paymentMethodId);
      continue;
    }
    throw new Error(
      `Unknown argument: ${arg}. Supported args: --dry-run, --householdId=<id>, --map=\"old name=paymentMethodId\"`
    );
  }

  return result;
}

function logHouseholdSummary(householdId, stats) {
  console.log(
    [
      `[${householdId}]`,
      `transactions=${stats.total}`,
      `updated=${stats.updated}`,
      `alreadyLinked=${stats.alreadyLinked}`,
      `missingName=${stats.missingName}`,
      `unresolved=${stats.unresolved}`,
    ].join(" ")
  );
}

function normalizeOwnerCandidates(candidates) {
  if (candidates.length <= 1) {
    return candidates;
  }
  const parentCandidates = candidates.filter((candidate) => !candidate.parentId);
  if (parentCandidates.length === 1) {
    return parentCandidates;
  }
  return candidates;
}

function pickCandidateByOwner(candidates, owner) {
  if (!owner) {
    return null;
  }
  const ownerMatched = normalizeOwnerCandidates(
    candidates.filter((candidate) => (candidate.owner ?? "our") === owner)
  );
  if (ownerMatched.length === 1) {
    return ownerMatched[0];
  }
  return null;
}

async function main() {
  const { householdId, dryRun, manualMappings } = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId();

  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
  }

  const db = getFirestore();
  const householdRefs = householdId
    ? [db.collection("households").doc(householdId)]
    : await db.collection("households").listDocuments();

  if (householdRefs.length === 0) {
    console.log("No households found.");
    return;
  }

  const overall = {
    total: 0,
    updated: 0,
    alreadyLinked: 0,
    missingName: 0,
    unresolved: 0,
  };
  const unresolvedRows = [];

  for (const householdRef of householdRefs) {
    const householdDoc = await householdRef.get();
    const paymentSnapshot = await householdRef.collection("paymentMethods").get();
    const transactionSnapshot = await householdRef.collection("transactions").get();
    const memberSnapshot = await householdRef.collection("members").get();

    const householdData = householdDoc.exists ? householdDoc.data() ?? {} : {};
    const userRoleById = new Map();
    const ownerBySubjectName = new Map();

    for (const memberDoc of memberSnapshot.docs) {
      const userDoc = await db.collection("users").doc(memberDoc.id).get();
      const userData = userDoc.exists ? userDoc.data() ?? {} : {};
      const displayName = normalizeName(userData.displayName);
      const spouseRole =
        userData.spouseRole === "husband" || userData.spouseRole === "wife"
          ? userData.spouseRole
          : null;
      if (spouseRole) {
        userRoleById.set(memberDoc.id, spouseRole);
      }
      if (displayName && spouseRole) {
        ownerBySubjectName.set(displayName, spouseRole);
      }
    }

    const creatorDisplayName = normalizeName(householdData.creatorDisplayName);
    const partnerDisplayName = normalizeName(householdData.partnerDisplayName);
    if (creatorDisplayName && !ownerBySubjectName.has(creatorDisplayName)) {
      const ownerUid = memberSnapshot.docs.find((doc) => doc.data().role === "owner")?.id;
      const ownerRole = ownerUid ? userRoleById.get(ownerUid) ?? null : null;
      if (ownerRole) {
        ownerBySubjectName.set(creatorDisplayName, ownerRole);
      }
    }
    if (partnerDisplayName && !ownerBySubjectName.has(partnerDisplayName)) {
      const partnerUid =
        memberSnapshot.docs.find((doc) => doc.data().role !== "owner")?.id ?? null;
      const partnerRole = partnerUid ? userRoleById.get(partnerUid) ?? null : null;
      if (partnerRole) {
        ownerBySubjectName.set(partnerDisplayName, partnerRole);
      }
    }

    const paymentMethodsById = new Map();
    const paymentMethodIdsByName = new Map();

    for (const paymentDoc of paymentSnapshot.docs) {
      const paymentData = paymentDoc.data();
      const name = normalizeName(paymentData.name);
      paymentMethodsById.set(paymentDoc.id, {
        id: paymentDoc.id,
        name,
        owner: paymentData.owner ?? "our",
        parentId: paymentData.parentId ?? null,
      });
      if (!name) {
        continue;
      }
      const existingIds = paymentMethodIdsByName.get(name) ?? [];
      existingIds.push(paymentDoc.id);
      paymentMethodIdsByName.set(name, existingIds);
    }

    const stats = {
      total: 0,
      updated: 0,
      alreadyLinked: 0,
      missingName: 0,
      unresolved: 0,
    };
    let batch = db.batch();
    let batchCount = 0;

    for (const transactionDoc of transactionSnapshot.docs) {
      stats.total += 1;
      overall.total += 1;

      const data = transactionDoc.data();
      const existingPaymentMethodId =
        typeof data.paymentMethodId === "string" ? data.paymentMethodId.trim() : "";
      if (existingPaymentMethodId) {
        stats.alreadyLinked += 1;
        overall.alreadyLinked += 1;
        continue;
      }

      const legacyName = normalizeName(data.paymentMethod);
      if (!legacyName) {
        stats.missingName += 1;
        overall.missingName += 1;
        continue;
      }

      let resolvedPaymentMethodId = null;
      let resolutionReason = "";

      const manuallyMappedId = manualMappings.get(legacyName);
      if (manuallyMappedId) {
        if (paymentMethodsById.has(manuallyMappedId)) {
          resolvedPaymentMethodId = manuallyMappedId;
        } else {
          resolutionReason = `manual target missing (${manuallyMappedId})`;
        }
      } else {
        const candidateIds = paymentMethodIdsByName.get(legacyName) ?? [];
        if (candidateIds.length === 1) {
          resolvedPaymentMethodId = candidateIds[0];
        } else if (candidateIds.length === 0) {
          resolutionReason = "no name match";
        } else {
          const candidates = candidateIds
            .map((candidateId) => paymentMethodsById.get(candidateId))
            .filter(Boolean);
          const subjectName = normalizeName(data.subject);
          const createdBy = normalizeName(data.createdBy);
          const preferredOwnerBySubject =
            subjectName === "우리"
              ? "our"
              : ownerBySubjectName.get(subjectName) ?? null;
          const preferredOwnerByCreator = userRoleById.get(createdBy) ?? null;

          const subjectMatched = pickCandidateByOwner(
            candidates,
            preferredOwnerBySubject
          );
          if (subjectMatched) {
            resolvedPaymentMethodId = subjectMatched.id;
          } else {
            const creatorMatched = pickCandidateByOwner(
              candidates,
              preferredOwnerByCreator
            );
            if (creatorMatched) {
              resolvedPaymentMethodId = creatorMatched.id;
            } else {
              resolutionReason = `ambiguous name (${candidateIds.length} matches)`;
            }
          }
        }
      }

      if (!resolvedPaymentMethodId) {
        stats.unresolved += 1;
        overall.unresolved += 1;
        unresolvedRows.push({
          householdId: householdRef.id,
          transactionId: transactionDoc.id,
          paymentMethod: legacyName,
          note: normalizeName(data.note),
          reason: resolutionReason,
        });
        continue;
      }

      const resolvedPaymentMethod = paymentMethodsById.get(resolvedPaymentMethodId);
      if (!resolvedPaymentMethod) {
        stats.unresolved += 1;
        overall.unresolved += 1;
        unresolvedRows.push({
          householdId: householdRef.id,
          transactionId: transactionDoc.id,
          paymentMethod: legacyName,
          note: normalizeName(data.note),
          reason: `resolved ID missing (${resolvedPaymentMethodId})`,
        });
        continue;
      }

      stats.updated += 1;
      overall.updated += 1;

      if (!dryRun) {
        batch.update(transactionDoc.ref, {
          paymentMethodId: resolvedPaymentMethod.id,
          paymentMethod: resolvedPaymentMethod.name || legacyName,
        });
        batchCount += 1;
        if (batchCount >= 450) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
    }

    if (!dryRun && batchCount > 0) {
      await batch.commit();
    }

    logHouseholdSummary(householdRef.id, stats);
  }

  console.log("");
  console.log(`Project: ${projectId ?? "(auto)"}`);
  console.log(`Mode: ${dryRun ? "dry-run" : "write"}`);
  console.log(
    `Overall total=${overall.total} updated=${overall.updated} alreadyLinked=${overall.alreadyLinked} missingName=${overall.missingName} unresolved=${overall.unresolved}`
  );

  if (unresolvedRows.length > 0) {
    console.log("");
    console.log("Unresolved transactions (first 20):");
    unresolvedRows.slice(0, 20).forEach((row) => {
      console.log(
        [
          `household=${row.householdId}`,
          `transaction=${row.transactionId}`,
          `paymentMethod="${row.paymentMethod}"`,
          `note="${row.note || "-"}"`,
          `reason=${row.reason}`,
        ].join(" ")
      );
    });
    console.log("");
    console.log(
      'Use --map="old payment name=paymentMethodId" for renamed or ambiguous cases.'
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
