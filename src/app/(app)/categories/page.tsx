"use client";

import { useHousehold } from "@/components/household-provider";
import { useCategories } from "@/hooks/use-categories";

export default function CategoriesPage() {
  const { householdId } = useHousehold();
  const { categories, loading } = useCategories(householdId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">카테고리</h1>
        <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
          수입/지출 카테고리를 관리하세요.
        </p>
      </div>
      <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
        {loading ? (
          <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
            불러오는 중...
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {categories.map((category) => (
              <div
                key={category.id}
                className="rounded-2xl border border-[var(--border)] px-4 py-3 text-sm"
              >
                <p className="font-medium">{category.name}</p>
                <p className="text-xs text-[color:rgba(45,38,34,0.7)]">
                  {category.type === "expense" ? "지출" : "수입"}
                </p>
              </div>
            ))}
            {categories.length === 0 ? (
              <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
                아직 등록된 카테고리가 없습니다.
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
