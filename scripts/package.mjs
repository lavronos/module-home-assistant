import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = process.cwd();
const manifestPath = path.join(repositoryRoot, "module.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const moduleId = requiredString(manifest.id, "id");
const version = requiredString(manifest.version, "version");

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(moduleId)) {
  throw new Error(`Invalid module id: ${moduleId}`);
}

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid module version: ${version}`);
}

const releaseTag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : "";
if (releaseTag && releaseTag !== `v${version}` && !releaseTag.startsWith(`v${version}-`)) {
  throw new Error(`Release tag ${releaseTag} does not match module version ${version}.`);
}

validateBinaryDeclarations(manifest.dependencies?.binaries);

const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${moduleId}-`));
const distRoot = path.join(repositoryRoot, "dist");
const archivePath = path.join(distRoot, `${moduleId}-${version}.zip`);
const checksumPath = `${archivePath}.sha256`;

fs.rmSync(distRoot, { recursive: true, force: true });
fs.mkdirSync(distRoot, { recursive: true });

for (const entry of ["module.json", "page.html", "dashboard.html", "assets", "bin", "CHANGELOG.md", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
  const source = path.join(repositoryRoot, entry);
  if (!fs.existsSync(source)) continue;
  fs.cpSync(source, path.join(stagingRoot, entry), { recursive: true });
}

const zip = spawnSync("zip", ["-X", "-q", "-r", archivePath, "."], {
  cwd: stagingRoot,
  stdio: "inherit"
});

fs.rmSync(stagingRoot, { recursive: true, force: true });

if (zip.status !== 0 || !fs.existsSync(archivePath)) {
  throw new Error("Could not create the module ZIP package.");
}

const hash = crypto.createHash("sha256").update(fs.readFileSync(archivePath)).digest("hex");
fs.writeFileSync(checksumPath, `${hash}  ${path.basename(archivePath)}\n`);

console.log(`Created ${path.relative(repositoryRoot, archivePath)}`);
console.log(`SHA-256 ${hash}`);

function validateBinaryDeclarations(value) {
  if (value == null) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("dependencies.binaries must be an object.");
  }

  for (const [binaryName, platforms] of Object.entries(value)) {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(binaryName) || !platforms || typeof platforms !== "object" || Array.isArray(platforms)) {
      throw new Error(`Invalid bundled binary declaration: ${binaryName}`);
    }

    for (const [platform, relativePath] of Object.entries(platforms)) {
      if (!/^(linux)-(x64|arm64)$/.test(platform) || typeof relativePath !== "string" || !isSafeRelativePath(relativePath)) {
        throw new Error(`Invalid path for ${binaryName} on ${platform}.`);
      }

      const binaryPath = path.join(repositoryRoot, relativePath);
      if (!fs.statSync(binaryPath, { throwIfNoEntry: false })?.isFile()) {
        throw new Error(`Missing bundled binary ${binaryName} for ${platform}: ${relativePath}`);
      }
    }
  }
}

function isSafeRelativePath(value) {
  const normalized = value.trim().replaceAll("\\", "/");
  return Boolean(normalized) && !normalized.startsWith("/") && !normalized.split("/").includes("..") && !normalized.includes("\0");
}

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`module.json is missing ${field}.`);
  }

  return value.trim();
}
