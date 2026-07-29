import test from 'node:test';
import assert from 'node:assert';
import { StrKey } from '@stellar/stellar-sdk';
import { generateStellarKeypair } from './index.js';

test('generateStellarKeypair returns a valid public key (G…)', () => {
  const { publicKey, secretKey } = generateStellarKeypair();

  assert.ok(publicKey.startsWith('G'), 'public key should start with G');
  assert.ok(StrKey.isValidEd25519PublicKey(publicKey), 'public key should be a valid Ed25519 public key');
});

test('generateStellarKeypair returns a valid secret key (S…)', () => {
  const { publicKey, secretKey } = generateStellarKeypair();

  assert.ok(secretKey.startsWith('S'), 'secret key should start with S');
  assert.ok(StrKey.isValidEd25519SecretSeed(secretKey), 'secret key should be a valid Ed25519 secret seed');
});

test('generateStellarKeypair keys are mutually consistent', () => {
  const { publicKey, secretKey } = generateStellarKeypair();

  const keypairFromSecret = StrKey.decodeEd25519SecretSeed(secretKey);
  const expectedPublic = StrKey.encodeEd25519PublicKey(keypairFromSecret);
  assert.strictEqual(publicKey, expectedPublic, 'public key should derive from secret key');
});

test('generateStellarKeypair produces unique keypairs', () => {
  const kp1 = generateStellarKeypair();
  const kp2 = generateStellarKeypair();

  assert.notStrictEqual(kp1.publicKey, kp2.publicKey, 'two calls should produce different public keys');
  assert.notStrictEqual(kp1.secretKey, kp2.secretKey, 'two calls should produce different secret keys');
});
