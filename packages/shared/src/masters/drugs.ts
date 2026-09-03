import type { DrugForm } from '../clinical/treatment.js';

export interface DrugDefinition {
  code: string;
  name: string;
  genericName: string;
  form: DrugForm;
  strength?: string;
  /** Must never fall below the reorder level at a live camp. */
  emergencyTray: boolean;
  reorderLevel: number;
}

/** Seed drug list for a mass-gathering medical camp. */
export const DRUG_MASTER: DrugDefinition[] = [
  { code: 'PARACETAMOL', name: 'Paracetamol 500 mg', genericName: 'Paracetamol', form: 'TABLET', strength: '500 mg', emergencyTray: true, reorderLevel: 200 },
  { code: 'PARACETAMOL_SYP', name: 'Paracetamol syrup', genericName: 'Paracetamol', form: 'SYRUP', strength: '125 mg/5 mL', emergencyTray: false, reorderLevel: 30 },
  { code: 'ORS', name: 'ORS sachet', genericName: 'Oral rehydration salts', form: 'SACHET', emergencyTray: true, reorderLevel: 150 },
  { code: 'ZINC', name: 'Zinc 20 mg', genericName: 'Zinc sulphate', form: 'TABLET', strength: '20 mg', emergencyTray: false, reorderLevel: 100 },
  { code: 'CETIRIZINE', name: 'Cetirizine 10 mg', genericName: 'Cetirizine', form: 'TABLET', strength: '10 mg', emergencyTray: false, reorderLevel: 100 },
  { code: 'PANTOPRAZOLE', name: 'Pantoprazole 40 mg', genericName: 'Pantoprazole', form: 'TABLET', strength: '40 mg', emergencyTray: false, reorderLevel: 80 },
  { code: 'DOMPERIDONE', name: 'Domperidone 10 mg', genericName: 'Domperidone', form: 'TABLET', strength: '10 mg', emergencyTray: false, reorderLevel: 80 },
  { code: 'AMOXICILLIN', name: 'Amoxicillin 500 mg', genericName: 'Amoxicillin', form: 'TABLET', strength: '500 mg', emergencyTray: false, reorderLevel: 100 },
  { code: 'AZITHROMYCIN', name: 'Azithromycin 500 mg', genericName: 'Azithromycin', form: 'TABLET', strength: '500 mg', emergencyTray: false, reorderLevel: 60 },
  { code: 'METRONIDAZOLE', name: 'Metronidazole 400 mg', genericName: 'Metronidazole', form: 'TABLET', strength: '400 mg', emergencyTray: false, reorderLevel: 80 },
  { code: 'NS_IVF', name: 'Normal saline 500 mL', genericName: '0.9% Sodium chloride', form: 'IVF', strength: '500 mL', emergencyTray: true, reorderLevel: 40 },
  { code: 'RL_IVF', name: 'Ringer lactate 500 mL', genericName: 'Ringer lactate', form: 'IVF', strength: '500 mL', emergencyTray: true, reorderLevel: 40 },
  { code: 'ADRENALINE', name: 'Adrenaline injection', genericName: 'Adrenaline', form: 'INJECTION', strength: '1 mg/mL', emergencyTray: true, reorderLevel: 10 },
  { code: 'HYDROCORTISONE', name: 'Hydrocortisone injection', genericName: 'Hydrocortisone', form: 'INJECTION', strength: '100 mg', emergencyTray: true, reorderLevel: 10 },
  { code: 'PHENIRAMINE', name: 'Pheniramine injection', genericName: 'Pheniramine maleate', form: 'INJECTION', strength: '22.75 mg/mL', emergencyTray: true, reorderLevel: 10 },
  { code: 'TT', name: 'Tetanus toxoid', genericName: 'Tetanus toxoid', form: 'INJECTION', strength: '0.5 mL', emergencyTray: true, reorderLevel: 25 },
  { code: 'ARV', name: 'Anti-rabies vaccine', genericName: 'Rabies vaccine', form: 'INJECTION', strength: '1 mL', emergencyTray: false, reorderLevel: 10 },
  { code: 'ASV', name: 'Anti-snake venom', genericName: 'Polyvalent anti-snake venom', form: 'INJECTION', emergencyTray: false, reorderLevel: 10 },
  { code: 'POVIDONE', name: 'Povidone iodine ointment', genericName: 'Povidone iodine', form: 'OINTMENT', strength: '5%', emergencyTray: true, reorderLevel: 20 },
  { code: 'SALBUTAMOL_NEB', name: 'Salbutamol respules', genericName: 'Salbutamol', form: 'INJECTION', strength: '2.5 mg', emergencyTray: true, reorderLevel: 20 },
];

export function drugByCode(code: string): DrugDefinition | undefined {
  return DRUG_MASTER.find((d) => d.code === code);
}
