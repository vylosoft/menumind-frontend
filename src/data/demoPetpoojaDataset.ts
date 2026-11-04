import { RawSalesRecord } from '../types/restaurant';

export interface DemoItemSpec {
  rawItemName: string;
  category: string;
  orderType: string;
  salesChannel: string;
  outlet: string;
  // monthly breakdown [May, Jun, Jul, Aug, Sep, Oct 2026]
  monthlyQty: number[];
  unitPrices: number[]; // price per unit for each month (or constant)
  // cost breakdown
  unitCost?: number;
  packagingCost?: number;
  commissionRatePct?: number;
  preparationCost?: number;
  isSignatureDish?: boolean;
  isCulturallyImportant?: boolean;
}

// Full 6-month specifications for the realistic demo dataset
export const DEMO_SPECS: DemoItemSpec[] = [
  // 1. Mandatory Chicken Biryani variants (Exact totals: 640 units, ₹1,48,000)
  {
    rawItemName: 'Kolkata Chicken Biryani - Light',
    category: 'Biryani & Rice',
    orderType: 'Delivery',
    salesChannel: 'Swiggy',
    outlet: 'Park Street Flagship',
    monthlyQty: [18, 20, 22, 20, 19, 21], // sum = 120
    unitPrices: [150, 150, 150, 150, 150, 150], // 120 * 150 = 18,000
    unitCost: 55,
    packagingCost: 15,
    commissionRatePct: 18,
    preparationCost: 10,
  },
  {
    rawItemName: 'Kolkata Chicken Biryani - Small',
    category: 'Biryani & Rice',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [28, 30, 32, 29, 31, 30], // sum = 180
    unitPrices: [200, 200, 200, 200, 200, 200], // 180 * 200 = 36,000
    unitCost: 75,
    packagingCost: 8,
    commissionRatePct: 0,
    preparationCost: 12,
  },
  {
    rawItemName: 'Kolkata Chicken Biryani - Standard',
    category: 'Biryani & Rice',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [38, 42, 44, 41, 43, 42], // sum = 250
    unitPrices: [250, 250, 250, 250, 250, 250], // 250 * 250 = 62,500
    unitCost: 95,
    packagingCost: 8,
    commissionRatePct: 0,
    preparationCost: 15,
    isSignatureDish: true,
    isCulturallyImportant: true,
  },
  {
    rawItemName: 'Kolkata Chicken Biryani - Large',
    category: 'Biryani & Rice',
    orderType: 'Takeaway',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [14, 15, 16, 15, 14, 16], // sum = 90
    unitPrices: [350, 350, 350, 350, 350, 350], // 90 * 350 = 31,500
    unitCost: 130,
    packagingCost: 18,
    commissionRatePct: 0,
    preparationCost: 20,
  },

  // 2. Mutton Biryani (MUST REMAIN DISTINCT FROM CHICKEN BIRYANI)
  {
    rawItemName: 'Kolkata Mutton Biryani - Regular',
    category: 'Biryani & Rice',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [45, 48, 52, 50, 53, 56], // sum = 304
    unitPrices: [380, 380, 380, 380, 380, 380], // 304 * 380 = 1,15,520
    unitCost: 165,
    packagingCost: 10,
    commissionRatePct: 0,
    preparationCost: 25,
    isSignatureDish: true,
  },
  {
    rawItemName: 'Kolkata Mutton Biryani - Special Extra Mutton',
    category: 'Biryani & Rice',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [20, 22, 25, 24, 28, 30], // sum = 149
    unitPrices: [490, 490, 490, 490, 490, 490], // 149 * 490 = 73,010
    unitCost: 230,
    packagingCost: 10,
    commissionRatePct: 0,
    preparationCost: 30,
  },

  // 3. Distinct Fish Dishes (MUST REMAIN SEPARATE)
  {
    rawItemName: 'Rohu Kalia - Regular',
    category: 'Fish Specialties',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [30, 28, 25, 24, 22, 20], // Declining trend: 149
    unitPrices: [190, 190, 190, 190, 190, 190], // 28,310
    unitCost: 85,
    packagingCost: 8,
    commissionRatePct: 0,
    preparationCost: 15,
  },
  {
    rawItemName: 'Rohu Kalia - Half',
    category: 'Fish Specialties',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [15, 14, 12, 10, 9, 8], // Declining trend: 68
    unitPrices: [110, 110, 110, 110, 110, 110], // 7,480
    unitCost: 50,
    packagingCost: 6,
    commissionRatePct: 0,
    preparationCost: 10,
  },
  {
    rawItemName: 'Katla Kalia - Standard',
    category: 'Fish Specialties',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [35, 38, 40, 42, 45, 48], // Steady rising: 248
    unitPrices: [240, 240, 240, 240, 240, 240], // 59,520
    unitCost: 105,
    packagingCost: 8,
    commissionRatePct: 0,
    preparationCost: 18,
  },
  {
    rawItemName: 'Shorshe Ilish - 1 Pc',
    category: 'Fish Specialties',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [25, 28, 30, 35, 40, 45], // High value: 203
    unitPrices: [480, 480, 480, 480, 480, 480], // 97,440
    unitCost: 260,
    packagingCost: 12,
    commissionRatePct: 0,
    preparationCost: 35,
    isCulturallyImportant: true,
  },
  {
    rawItemName: 'Shorshe Ilish - 2 Pcs',
    category: 'Fish Specialties',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [12, 14, 16, 18, 20, 22], // 102
    unitPrices: [880, 880, 880, 880, 880, 880], // 89,760
    unitCost: 490,
    packagingCost: 15,
    commissionRatePct: 0,
    preparationCost: 45,
    isCulturallyImportant: true,
  },
  {
    rawItemName: 'Bhetki Paturi - 1 Pc',
    category: 'Fish Specialties',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [18, 24, 32, 40, 50, 62], // FAST RISING STAR: 226
    unitPrices: [320, 320, 320, 320, 320, 320], // 72,320
    unitCost: 135,
    packagingCost: 10,
    commissionRatePct: 0,
    preparationCost: 25,
    isSignatureDish: true,
  },
  {
    rawItemName: 'Ilish Jhol - Regular',
    category: 'Fish Specialties',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [12, 13, 15, 14, 16, 15], // 85
    unitPrices: [420, 420, 420, 420, 420, 420], // 35,700
    unitCost: 220,
    packagingCost: 10,
    commissionRatePct: 0,
    preparationCost: 25,
  },

  // 4. Bengali Vegetarian Dishes
  {
    rawItemName: 'Aloo Posto - Regular',
    category: 'Bengali Vegetarian',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [42, 45, 44, 46, 48, 50], // 275
    unitPrices: [160, 160, 160, 160, 160, 160], // 44,000
    unitCost: 70, // Poppy seeds are expensive!
    packagingCost: 6,
    commissionRatePct: 0,
    preparationCost: 10,
    isCulturallyImportant: true,
  },
  {
    rawItemName: 'Aloo Posto - Half',
    category: 'Bengali Vegetarian',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [20, 22, 19, 21, 23, 22], // 127
    unitPrices: [95, 95, 95, 95, 95, 95], // 12,065
    unitCost: 42,
    packagingCost: 5,
    commissionRatePct: 0,
    preparationCost: 8,
  },
  {
    rawItemName: 'Shukto - Standard',
    category: 'Bengali Vegetarian',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [35, 34, 36, 35, 37, 38], // 215
    unitPrices: [140, 140, 140, 140, 140, 140], // 30,100
    unitCost: 45,
    packagingCost: 6,
    commissionRatePct: 0,
    preparationCost: 12,
    isCulturallyImportant: true,
  },
  {
    rawItemName: 'Chhanar Dalna - Regular',
    category: 'Bengali Vegetarian',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [22, 24, 25, 23, 26, 28], // 148
    unitPrices: [180, 180, 180, 180, 180, 180], // 26,640
    unitCost: 65,
    packagingCost: 6,
    commissionRatePct: 0,
    preparationCost: 15,
  },

  // 5. Rolls (Chicken Roll vs Egg Chicken Roll MUST BE KEPT DISTINCT)
  {
    rawItemName: 'Kolkata Chicken Roll - Single Chicken',
    category: 'Rolls & Quick Bites',
    orderType: 'Takeaway',
    salesChannel: 'Zomato',
    outlet: 'Park Street Flagship',
    monthlyQty: [60, 65, 70, 75, 80, 85], // 435
    unitPrices: [90, 90, 90, 90, 90, 90], // 39,150
    unitCost: 32,
    packagingCost: 6,
    commissionRatePct: 22,
    preparationCost: 8,
  },
  {
    rawItemName: 'Kolkata Chicken Roll - Double Chicken',
    category: 'Rolls & Quick Bites',
    orderType: 'Takeaway',
    salesChannel: 'Zomato',
    outlet: 'Park Street Flagship',
    monthlyQty: [40, 42, 45, 48, 52, 55], // 282
    unitPrices: [130, 130, 130, 130, 130, 130], // 36,660
    unitCost: 48,
    packagingCost: 6,
    commissionRatePct: 22,
    preparationCost: 10,
  },
  {
    rawItemName: 'Egg Chicken Roll - Single Egg Single Chicken',
    category: 'Rolls & Quick Bites',
    orderType: 'Takeaway',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [55, 58, 62, 60, 65, 68], // 368
    unitPrices: [110, 110, 110, 110, 110, 110], // 40,480
    unitCost: 40,
    packagingCost: 6,
    commissionRatePct: 0,
    preparationCost: 10,
  },
  {
    rawItemName: 'Paneer Roll - Regular',
    category: 'Rolls & Quick Bites',
    orderType: 'Takeaway',
    salesChannel: 'Zomato',
    outlet: 'Park Street Flagship',
    monthlyQty: [25, 26, 28, 27, 29, 30], // 165
    unitPrices: [95, 95, 95, 95, 95, 95], // 15,675
    unitCost: 35,
    packagingCost: 6,
    commissionRatePct: 22,
    preparationCost: 8,
  },

  // 6. Starters & Specialties
  {
    rawItemName: 'Kolkata Fish Fry - 1 Pc',
    category: 'Starters',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [58, 62, 65, 70, 75, 80], // Demand Leader: 410
    unitPrices: [180, 180, 180, 180, 180, 180], // 73,800
    unitCost: 72,
    packagingCost: 8,
    commissionRatePct: 0,
    preparationCost: 15,
    isSignatureDish: true,
  },
  {
    rawItemName: 'Chicken Chaap - Full',
    category: 'Biryani & Rice',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [50, 52, 55, 56, 58, 62], // 333
    unitPrices: [220, 220, 220, 220, 220, 220], // 73,260
    unitCost: 88,
    packagingCost: 8,
    commissionRatePct: 0,
    preparationCost: 20,
  },
  {
    rawItemName: 'Gondhoraj Chicken - Standard',
    category: 'Starters',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [15, 22, 30, 42, 55, 72], // MASSIVE RISING STAR: 236
    unitPrices: [260, 260, 260, 260, 260, 260], // 61,360
    unitCost: 85,
    packagingCost: 8,
    commissionRatePct: 0,
    preparationCost: 20,
    isSignatureDish: true,
  },

  // 7. Thalis (Veg vs Non-Veg MUST REMAIN DISTINCT)
  {
    rawItemName: 'Bengali Veg Thali - Standard',
    category: 'Thalis',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [40, 42, 45, 44, 46, 48], // 265
    unitPrices: [220, 220, 220, 220, 220, 220], // 58,300
    unitCost: 80,
    packagingCost: 10,
    commissionRatePct: 0,
    preparationCost: 25,
  },
  {
    rawItemName: 'Non-Veg Chicken Thali - Special',
    category: 'Thalis',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [50, 54, 58, 60, 64, 68], // 354
    unitPrices: [320, 320, 320, 320, 320, 320], // 1,13,280
    unitCost: 120,
    packagingCost: 10,
    commissionRatePct: 0,
    preparationCost: 30,
  },

  // 8. Declining & Menu Exit Candidates
  {
    rawItemName: 'Mixed Fried Rice - Standard',
    category: 'Biryani & Rice',
    orderType: 'Delivery',
    salesChannel: 'Swiggy',
    outlet: 'Park Street Flagship',
    monthlyQty: [28, 24, 18, 14, 10, 6], // SEVERE DECLINING: 100
    unitPrices: [240, 240, 240, 240, 240, 240], // 24,000
    unitCost: 110,
    packagingCost: 15,
    commissionRatePct: 20,
    preparationCost: 25,
  },
  {
    rawItemName: 'Plain Paneer Curry - Regular',
    category: 'Bengali Vegetarian',
    orderType: 'Dine-in',
    salesChannel: 'Direct POS',
    outlet: 'Park Street Flagship',
    monthlyQty: [8, 7, 5, 4, 3, 2], // MENU EXIT CANDIDATE: 29
    unitPrices: [170, 170, 170, 170, 170, 170], // 4,930
    unitCost: 85,
    packagingCost: 6,
    commissionRatePct: 0,
    preparationCost: 20,
  },
];

// Months present in the demo dataset
export const DEMO_MONTHS = [
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
];

/**
 * Generates realistic daily Petpooja export rows across 6 months
 */
export function generateDemoSalesRecords(): RawSalesRecord[] {
  const records: RawSalesRecord[] = [];
  let rowCounter = 1;

  DEMO_SPECS.forEach((spec) => {
    spec.monthlyQty.forEach((monthQty, mIdx) => {
      const ym = DEMO_MONTHS[mIdx];
      const unitPrice = spec.unitPrices[mIdx];

      // Distribute the monthly quantity into 4 distinct weekly sales records
      // to simulate realistic Petpooja transactions with dates
      const weeks = [
        { day: '05', fraction: 0.22 },
        { day: '12', fraction: 0.25 },
        { day: '19', fraction: 0.27 },
        { day: '26', fraction: 0.26 },
      ];

      let distributedQty = 0;
      weeks.forEach((wk, wIdx) => {
        let qty: number;
        if (wIdx === weeks.length - 1) {
          // Last week gets remainder to match exact sum
          qty = monthQty - distributedQty;
        } else {
          qty = Math.round(monthQty * wk.fraction);
          distributedQty += qty;
        }

        if (qty > 0) {
          const revenue = qty * unitPrice;
          records.push({
            rowId: `petpooja-demo-row-${rowCounter++}`,
            sourceFile: `Petpooja_Sales_Report_${ym.replace('-', '_')}.xlsx`,
            rawItemName: spec.rawItemName,
            quantity: qty,
            revenue: revenue,
            isNetSales: true,
            date: `${ym}-${wk.day}`,
            category: spec.category,
            orderType: spec.orderType,
            salesChannel: spec.salesChannel,
            outlet: spec.outlet,
            discount: 0,
            returnAmount: 0,
            isReturnOrCancelled: false,
          });
        }
      });
    });
  });

  return records;
}

// Preset cost dictionary for demo dataset
export const DEMO_COST_PRESETS: Record<
  string,
  {
    unitCost: number;
    packagingCost: number;
    commissionRatePct: number;
    preparationCost: number;
    isSignature?: boolean;
    isCulturallyImportant?: boolean;
  }
> = {
  'Chicken Biryani': {
    unitCost: 85,
    packagingCost: 10,
    commissionRatePct: 5,
    preparationCost: 14,
    isSignature: true,
    isCulturallyImportant: true,
  },
  'Mutton Biryani': {
    unitCost: 185,
    packagingCost: 10,
    commissionRatePct: 0,
    preparationCost: 26,
    isSignature: true,
    isCulturallyImportant: true,
  },
  'Rohu Kalia': {
    unitCost: 75,
    packagingCost: 8,
    commissionRatePct: 0,
    preparationCost: 14,
  },
  'Katla Kalia': {
    unitCost: 105,
    packagingCost: 8,
    commissionRatePct: 0,
    preparationCost: 18,
  },
  'Shorshe Ilish': {
    unitCost: 330,
    packagingCost: 12,
    commissionRatePct: 0,
    preparationCost: 38,
    isCulturallyImportant: true,
  },
  'Bhetki Paturi': {
    unitCost: 135,
    packagingCost: 10,
    commissionRatePct: 0,
    preparationCost: 25,
    isSignature: true,
  },
  'Ilish Jhol': {
    unitCost: 220,
    packagingCost: 10,
    commissionRatePct: 0,
    preparationCost: 25,
  },
  'Aloo Posto': {
    unitCost: 62,
    packagingCost: 6,
    commissionRatePct: 0,
    preparationCost: 10,
    isCulturallyImportant: true,
  },
  'Shukto': {
    unitCost: 45,
    packagingCost: 6,
    commissionRatePct: 0,
    preparationCost: 12,
    isCulturallyImportant: true,
  },
  'Chhanar Dalna': {
    unitCost: 65,
    packagingCost: 6,
    commissionRatePct: 0,
    preparationCost: 15,
  },
  'Chicken Roll': {
    unitCost: 38,
    packagingCost: 6,
    commissionRatePct: 22,
    preparationCost: 9,
  },
  'Egg Chicken Roll': {
    unitCost: 40,
    packagingCost: 6,
    commissionRatePct: 0,
    preparationCost: 10,
  },
  'Paneer Roll': {
    unitCost: 35,
    packagingCost: 6,
    commissionRatePct: 22,
    preparationCost: 8,
  },
  'Fish Fry': {
    unitCost: 72,
    packagingCost: 8,
    commissionRatePct: 0,
    preparationCost: 15,
    isSignature: true,
  },
  'Chicken Chaap': {
    unitCost: 88,
    packagingCost: 8,
    commissionRatePct: 0,
    preparationCost: 20,
  },
  'Gondhoraj Chicken': {
    unitCost: 85,
    packagingCost: 8,
    commissionRatePct: 0,
    preparationCost: 20,
    isSignature: true,
  },
  'Veg Thali': {
    unitCost: 80,
    packagingCost: 10,
    commissionRatePct: 0,
    preparationCost: 25,
  },
  'Non-Veg Chicken Thali': {
    unitCost: 120,
    packagingCost: 10,
    commissionRatePct: 0,
    preparationCost: 30,
  },
  'Mixed Fried Rice': {
    unitCost: 110,
    packagingCost: 15,
    commissionRatePct: 20,
    preparationCost: 25,
  },
  'Plain Paneer Curry': {
    unitCost: 85,
    packagingCost: 6,
    commissionRatePct: 0,
    preparationCost: 20,
  },
};
