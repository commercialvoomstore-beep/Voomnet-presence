// Hachage des mots de passe et jetons de session — commun aux deux modes de stockage.
// Prototype : scrypt (dérivation locale). En production : bcrypt/argon2 via variables
// d’environnement, comme l'indique la section « Passage en production » du README.

import crypto from 'crypto';

export function newSalt() {
  return crypto.randomBytes(16).toString('hex');
}

export function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

// Comparaison en temps constant (même longueur exigee par timingSafeEqual)
export function verifyHash(password, salt, expectedHash) {
  const candidate = hashPassword(password, salt);
  if (candidate.length !== String(expectedHash).length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expectedHash));
}

export function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}
