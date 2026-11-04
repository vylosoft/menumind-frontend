import { ParentDish, RemovalSimulation } from '../types/restaurant';

export function simulateMenuRemoval(
  allDishes: ParentDish[],
  targetDishIds: string[],
  substituteDishId?: string,
  demandShiftPct: number = 40 // Default 40% switch to alternative
): RemovalSimulation {
  const targetDishes = allDishes.filter((d) => targetDishIds.includes(d.id));
  const substituteDish = allDishes.find((d) => d.id === substituteDishId);

  const originalLostRevenue = targetDishes.reduce((sum, d) => sum + d.totalRevenue, 0);
  const originalLostUnits = targetDishes.reduce((sum, d) => sum + d.totalQuantity, 0);

  const shiftFactor = Math.min(100, Math.max(0, demandShiftPct)) / 100;
  const retainedUnits = Math.round(originalLostUnits * shiftFactor);

  let retainedRevenue = 0;
  if (substituteDish && retainedUnits > 0) {
    retainedRevenue = Math.round(retainedUnits * substituteDish.averageRealizedPrice);
  } else if (retainedUnits > 0 && targetDishes.length > 0) {
    // If no specific substitute chosen, average price of remaining menu
    const remainingDishes = allDishes.filter((d) => !targetDishIds.includes(d.id));
    const avgRemainingPrice =
      remainingDishes.length > 0
        ? remainingDishes.reduce((sum, d) => sum + d.averageRealizedPrice, 0) / remainingDishes.length
        : 200;
    retainedRevenue = Math.round(retainedUnits * avgRemainingPrice);
  }

  const netRevenueChange = retainedRevenue - originalLostRevenue;
  const netRevenueChangePct =
    originalLostRevenue > 0 ? (netRevenueChange / originalLostRevenue) * 100 : 0;

  // Build risk warnings
  const riskWarnings: string[] = [];
  targetDishes.forEach((d) => {
    if (d.isSignatureDish) {
      riskWarnings.push(`"${d.name}" is marked as a Signature Dish. Guest brand loyalty may suffer.`);
    }
    if (d.isCulturallyImportant) {
      riskWarnings.push(`"${d.name}" is a culturally expected staple (e.g. authentic Bengali item).`);
    }
    if (d.rankVolume <= 10) {
      riskWarnings.push(`"${d.name}" is in the top 10 most-ordered dishes. High customer disruption risk!`);
    }
    if (d.variants.length >= 3) {
      riskWarnings.push(`"${d.name}" has ${d.variants.length} variants. Consider consolidating variants first before full removal.`);
    }
  });

  // Calculate kitchen complexity reduction
  let savedComplexityScore = 'Moderate';
  if (targetDishes.length >= 3) {
    savedComplexityScore = 'High - frees up significant cold storage and prep station capacity';
  } else if (targetDishes.some((d) => d.category.includes('Fish') || d.category.includes('Biryani'))) {
    savedComplexityScore = 'Significant - reduces specialized raw protein prep and daily spoilage';
  } else {
    savedComplexityScore = 'Minor - simplifies daily prep mise-en-place';
  }

  // Recommendation logic
  let recommendation: RemovalSimulation['recommendation'] = 'CONSIDER_REMOVING';
  if (riskWarnings.length >= 2 || targetDishes.some((d) => d.isSignatureDish || d.rankVolume <= 5)) {
    recommendation = 'KEEP';
  } else if (targetDishes.some((d) => d.variants.length >= 3)) {
    recommendation = 'REDUCE_VARIANTS';
  } else if (Math.abs(netRevenueChangePct) > 50 && originalLostRevenue > 50000) {
    recommendation = 'RUN_TRIAL';
  } else if (targetDishes.some((d) => d.classification === 'DECLINING')) {
    recommendation = 'IMPROVE_REPRICE';
  }

  return {
    targetDishIds,
    substituteDishId,
    demandShiftPct,
    originalLostRevenue,
    originalLostUnits,
    retainedRevenue,
    retainedUnits,
    netRevenueChange,
    netRevenueChangePct: Math.round(netRevenueChangePct * 10) / 10,
    savedComplexityScore,
    riskWarnings,
    recommendation,
  };
}
