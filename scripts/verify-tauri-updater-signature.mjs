import { createHash, createPublicKey, verify } from 'node:crypto'
import { basename } from 'node:path'
import { readFileSync } from 'node:fs'

const [archivePath, signaturePath, configPath, expectedVersion] = process.argv.slice(2)

if (!archivePath || !signaturePath || !configPath || !expectedVersion) {
  throw new Error(
    'Usage: node scripts/verify-tauri-updater-signature.mjs <archive> <signature> <tauri-config> <version>',
  )
}

const config = JSON.parse(readFileSync(configPath, 'utf8'))
const encodedPublicKey = config?.plugins?.updater?.pubkey
if (!encodedPublicKey) {
  throw new Error(`Updater public key is missing from ${configPath}`)
}

const publicKeyLines = Buffer.from(encodedPublicKey, 'base64').toString('utf8').trim().split(/\r?\n/)
const signatureLines = Buffer.from(readFileSync(signaturePath, 'utf8').trim(), 'base64')
  .toString('utf8')
  .trim()
  .split(/\r?\n/)

if (publicKeyLines.length < 2 || signatureLines.length < 4) {
  throw new Error('Updater key or signature has an invalid minisign envelope')
}

const publicKeyPacket = Buffer.from(publicKeyLines[1], 'base64')
const signaturePacket = Buffer.from(signatureLines[1], 'base64')
const trustedCommentSignature = Buffer.from(signatureLines[3], 'base64')

if (publicKeyPacket.length !== 42 || signaturePacket.length !== 74 || trustedCommentSignature.length !== 64) {
  throw new Error('Updater key or signature has an invalid minisign packet size')
}

if (!publicKeyPacket.subarray(2, 10).equals(signaturePacket.subarray(2, 10))) {
  throw new Error('Updater signature key ID does not match the configured public key')
}

const publicKey = createPublicKey({
  key: Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    publicKeyPacket.subarray(10, 42),
  ]),
  format: 'der',
  type: 'spki',
})

const algorithm = signaturePacket.subarray(0, 2).toString('ascii')
const archive = readFileSync(archivePath)
const signedPayload = algorithm === 'ED'
  ? createHash('blake2b512').update(archive).digest()
  : algorithm === 'Ed'
    ? archive
    : null

if (!signedPayload) {
  throw new Error(`Unsupported minisign algorithm: ${algorithm}`)
}

if (!verify(null, signedPayload, publicKey, signaturePacket.subarray(10, 74))) {
  throw new Error(`Updater signature verification failed for ${basename(archivePath)}`)
}

const trustedCommentPrefix = 'trusted comment: '
if (!signatureLines[2].startsWith(trustedCommentPrefix)) {
  throw new Error('Updater signature is missing its trusted comment')
}

const trustedComment = signatureLines[2].slice(trustedCommentPrefix.length)
if (!trustedComment.split('\t').includes(`version:${expectedVersion}`)) {
  throw new Error(`Updater signature is not bound to version ${expectedVersion}`)
}

const trustedPayload = Buffer.concat([
  signaturePacket.subarray(10, 74),
  Buffer.from(trustedComment),
])
if (!verify(null, trustedPayload, publicKey, trustedCommentSignature)) {
  throw new Error('Updater signature trusted-comment verification failed')
}

console.log(`Verified updater signature for ${basename(archivePath)} at version ${expectedVersion}`)
