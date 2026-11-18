import StreamZip from 'node-stream-zip'
import got from 'got'
import { mkdirs, pathExists } from 'fs-extra/esm'
import { lstat, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { Module, Type } from 'helios-distribution-types'
import { URL } from 'url'
import { RepoStructure } from '../../structure/repo/Repo.struct.js'
import { BaseResolver } from '../BaseResolver.js'
import { MinecraftVersion } from '../../util/MinecraftVersion.js'
import { MavenUtil } from '../../util/MavenUtil.js'
import { LoggerUtil } from '../../util/LoggerUtil.js'

interface NeoForgeLibrary {
    name: string
    url?: string
    downloads?: {
        artifact?: {
            path?: string
            url?: string
        }
    }
}

interface NeoForgeVersionManifest {
    id: string
    inheritsFrom?: string
    mainClass: string
    arguments?: {
        game?: unknown[]
        jvm?: unknown[]
    }
    libraries: NeoForgeLibrary[]
}

export class NeoForgeResolver extends BaseResolver {

    private static readonly REMOTE_REPOSITORY = 'https://maven.neoforged.net/releases/'
    private static readonly logger = LoggerUtil.getLogger('NeoForgeResolver')

    private readonly repoStructure: RepoStructure
    private readonly artifactVersion: string

    constructor(
        absoluteRoot: string,
        relativeRoot: string,
        baseUrl: string,
        protected readonly minecraftVersion: MinecraftVersion,
        protected readonly neoForgeVersion: string,
        private readonly invalidateCache: boolean
    ) {
        super(absoluteRoot, relativeRoot, baseUrl)
        this.repoStructure = new RepoStructure(absoluteRoot, relativeRoot, 'neoforge')
        this.artifactVersion = `${minecraftVersion}-neoforge-${neoForgeVersion}`
    }

    public static isForVersion(version: MinecraftVersion, loaderVersion: string): boolean {
        return version.isGreaterThanOrEqualTo(new MinecraftVersion('1.20.2'))
            && /^\d+\.\d+\.\d+(?:[-+].*)?$/.test(loaderVersion)
    }

    public isForVersion(version: MinecraftVersion, loaderVersion: string): boolean {
        return NeoForgeResolver.isForVersion(version, loaderVersion)
    }

    public async getModule(): Promise<Module> {
        if (!NeoForgeResolver.isForVersion(this.minecraftVersion, this.neoForgeVersion)) {
            throw new Error(`NeoForge ${this.neoForgeVersion} is not supported for Minecraft ${this.minecraftVersion}.`)
        }

        const repo = this.repoStructure
        const versionRepo = repo.getVersionRepoStruct()
        const libraryRepo = repo.getLibRepoStruct()
        const versionManifestPath = versionRepo.getVersionManifest(this.minecraftVersion, this.neoForgeVersion)
        const versionManifestUrl = versionRepo.getVersionManifestURL(this.baseUrl, this.minecraftVersion, this.neoForgeVersion)
        const installerId = `net.neoforged:neoforge:${this.neoForgeVersion}:installer`
        const installerPath = libraryRepo.getArtifactById(installerId)
        if (this.invalidateCache || !await libraryRepo.artifactExists(installerPath)) {
            const cachedInstallerPath = join(repo.getCacheDirectory(), 'neoforge', `${this.neoForgeVersion}-installer.jar`)
            if (!this.invalidateCache && await pathExists(cachedInstallerPath)) {
                await mkdirs(dirname(installerPath))
                await writeFile(installerPath, await readFile(cachedInstallerPath))
            } else {
                const installerUrl = new URL(
                    MavenUtil.mavenIdentifierAsPath(installerId),
                    NeoForgeResolver.REMOTE_REPOSITORY
                ).toString()
                NeoForgeResolver.logger.info(`Downloading NeoForge ${this.neoForgeVersion} installer..`)
                const response = await got.get(installerUrl, { responseType: 'buffer' })
                await mkdirs(dirname(installerPath))
                await writeFile(installerPath, response.body)
            }
        }

        let versionManifestBuffer: Buffer
        if (!this.invalidateCache && await pathExists(versionManifestPath)) {
            versionManifestBuffer = await readFile(versionManifestPath)
        } else {
            const archive = new StreamZip.async({ file: installerPath })
            try {
                const entry = await archive.entry('version.json')
                if (entry == null) {
                    throw new Error('The NeoForge installer does not contain version.json.')
                }
                versionManifestBuffer = await archive.entryData(entry)
            } finally {
                await archive.close()
            }

            const versionManifest = JSON.parse(versionManifestBuffer.toString('utf8')) as NeoForgeVersionManifest
            if (versionManifest.inheritsFrom != null && versionManifest.inheritsFrom !== this.minecraftVersion.toString()) {
                throw new Error(`The NeoForge installer targets Minecraft ${versionManifest.inheritsFrom}, not ${this.minecraftVersion}.`)
            }
            if (!versionManifest.id || !versionManifest.mainClass || !Array.isArray(versionManifest.libraries)) {
                throw new Error('The NeoForge installer contains an incomplete version.json.')
            }

            await mkdirs(dirname(versionManifestPath))
            await writeFile(versionManifestPath, versionManifestBuffer)
        }

        const versionManifest = JSON.parse(versionManifestBuffer.toString('utf8')) as NeoForgeVersionManifest
        const versionManifestModule: Module = {
            id: this.artifactVersion,
            name: 'NeoForge (version.json)',
            type: Type.VersionManifest,
            artifact: this.generateArtifact(
                versionManifestBuffer,
                await lstat(versionManifestPath),
                versionManifestUrl
            )
        }

        // The official installer creates the patched client jar locally. Keep the
        // installer in Helios' common library store so the launcher can run that
        // processor once without bundling Mojang's transformed client jar in Git.
        const installerBuffer = await readFile(installerPath)
        const installerComponents = MavenUtil.getMavenComponents(installerId)
        const installerModule: Module = {
            id: installerId,
            name: 'NeoForge (client installer)',
            type: Type.Library,
            classpath: false,
            artifact: this.generateArtifact(
                installerBuffer,
                await lstat(installerPath),
                libraryRepo.getArtifactUrlByComponents(
                    this.baseUrl,
                    installerComponents.group,
                    installerComponents.artifact,
                    installerComponents.version,
                    installerComponents.classifier,
                    installerComponents.extension
                )
            )
        }

        const universalId = `net.neoforged:neoforge:${this.neoForgeVersion}:universal`
        const universalPath = libraryRepo.getArtifactById(universalId)
        if (this.invalidateCache || !await libraryRepo.artifactExists(universalPath)) {
            await libraryRepo.downloadArtifactById(NeoForgeResolver.REMOTE_REPOSITORY, universalId)
        }

        const universalBuffer = await readFile(universalPath)
        const universalComponents = MavenUtil.getMavenComponents(universalId)
        const neoForgeModule: Module = {
            id: universalId,
            name: 'NeoForge',
            type: Type.ForgeHosted,
            artifact: this.generateArtifact(
                universalBuffer,
                await lstat(universalPath),
                libraryRepo.getArtifactUrlByComponents(
                    this.baseUrl,
                    universalComponents.group,
                    universalComponents.artifact,
                    universalComponents.version,
                    universalComponents.classifier,
                    universalComponents.extension
                )
            ),
            subModules: [versionManifestModule, installerModule]
        }

        const libraryModules: Module[] = []
        const seen = new Set<string>([universalId])
        for (const library of versionManifest.libraries) {
            const components = MavenUtil.getMavenComponents(library.name)
            const libraryId = MavenUtil.mavenComponentsToIdentifier(
                components.group,
                components.artifact,
                components.version,
                components.classifier,
                components.extension
            )
            if (seen.has(libraryId)) {
                continue
            }
            seen.add(libraryId)

            const localPath = libraryRepo.getArtifactById(libraryId)
            const artifactPath = MavenUtil.mavenIdentifierAsPath(libraryId)
            if (this.invalidateCache || !await libraryRepo.artifactExists(localPath)) {
                const repositoryUrl = library.url == null
                    ? NeoForgeResolver.REMOTE_REPOSITORY
                    : `${library.url.replace(/\/+$/, '')}/`
                const upstreamUrl = library.downloads?.artifact?.url
                    ?? new URL(artifactPath, repositoryUrl).toString()
                await libraryRepo.downloadArtifactDirect(upstreamUrl, artifactPath)
            }

            const libraryBuffer = await readFile(localPath)
            libraryModules.push({
                id: libraryId,
                name: `NeoForge (${components.artifact})`,
                type: Type.Library,
                artifact: this.generateArtifact(
                    libraryBuffer,
                    await lstat(localPath),
                    libraryRepo.getArtifactUrlByComponents(
                        this.baseUrl,
                        components.group,
                        components.artifact,
                        components.version,
                        components.classifier,
                        components.extension
                    )
                )
            })
        }

        neoForgeModule.subModules?.push(...libraryModules)
        return neoForgeModule
    }
}
