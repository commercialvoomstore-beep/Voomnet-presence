// Valeurs d'amorçage partagées entre le mode fichier et le mode PostgreSQL.

export const DEFAULT_SETTINGS = {
  arrivalTime: '08:00',
  toleranceMinutes: 15,
  departureTime: '17:00',
  workdays: [1, 2, 3, 4, 5],
  timezone: 'Africa/Abidjan',
};

// Fiches employés de démonstration (noms fictifs à vocation illustrative)
export const DEFAULT_EMPLOYEES = [
  { matricule: '1009', name: 'Jean Kouassi', department: 'Support Technique', registeredAt: '15/01/2024' },
  { matricule: '1000', name: "Marie N'Guessan", department: 'Service Commercial', registeredAt: '03/06/2024' },
  { matricule: '1004', name: 'Paul Yao', department: 'Informatique & Réseaux', registeredAt: '21/10/2024' },
];
