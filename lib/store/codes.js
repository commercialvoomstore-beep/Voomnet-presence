// Codes d'accès 3CX — déplacés depuis lib/db.js pour être partageables
// entre l'amorçage PostgreSQL et le mode fichier.

import crypto from 'crypto';

// Codes individuels : 3CX-{matricule}-{suffixe} — suffixe unique et imprévisible
export function generateCode(matricule) {
  return `3CX-${matricule}-${crypto.randomInt(100, 1000)}`;
}

export function isCurrentCodeFormat(code, matricule) {
  return new RegExp(`^3CX-${String(matricule).replace(/\D/g, '')}-\\d{3,}$`).test(String(code || ''));
}

export function generateUniqueCode(matricule, codes) {
  const taken = new Set(Object.values(codes || {}).map((e) => e && e.code));
  for (let i = 0; i < 60; i++) {
    const candidate = generateCode(matricule);
    if (!taken.has(candidate)) return candidate;
  }
  return `3CX-${matricule}-${crypto.randomInt(1000, 10000)}`; // repli quasi impossible
}
