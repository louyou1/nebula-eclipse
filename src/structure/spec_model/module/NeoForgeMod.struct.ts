import { Stats } from 'fs'
import { Type } from 'helios-distribution-types'
import { join } from 'path'
import { URL } from 'url'
import { MinecraftVersion } from '../../../util/MinecraftVersion.js'
import { UntrackedFilesOption } from '../../../model/nebula/ServerMeta.js'
import { ToggleableModuleStructure } from './ToggleableModule.struct.js'

/**
 * Creates toggleable NeoForge jar modules. Type.ForgeMod keeps their files in the
 * launcher's common modstore; only enabled jars are copied into the instance mods/ folder.
 */
export class NeoForgeModStructure extends ToggleableModuleStructure {

    constructor(
        absoluteRoot: string,
        relativeRoot: string,
        baseUrl: string,
        minecraftVersion: MinecraftVersion,
        untrackedFiles: UntrackedFilesOption[]
    ) {
        super(
            absoluteRoot,
            relativeRoot,
            'neoforgemods',
            baseUrl,
            minecraftVersion,
            Type.ForgeMod,
            untrackedFiles,
            (name: string) => name.toLowerCase().endsWith('.jar')
        )
    }

    public getLoggerName(): string {
        return 'NeoForgeModStructure'
    }

    protected async getModuleId(name: string, _path: string): Promise<string> {
        const fileName = name.replace(/\.jar$/i, '')
        const versionMatch = /^(.+?)[-_ ]v?(\d+(?:\.\d+){1,3}(?:[-+][a-zA-Z0-9.+_-]+)?)$/i.exec(fileName)
        const artifactName = versionMatch?.[1] ?? fileName
        const artifact = artifactName
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'mod'
        const version = (versionMatch?.[2] ?? '1.0.0').replace(/[^a-zA-Z0-9.+_-]+/g, '-')
        return this.generateMavenIdentifier('eclipse.neoforge', artifact, version)
    }

    protected async getModuleName(name: string, _path: string): Promise<string> {
        return name.replace(/\.jar$/i, '')
    }

    protected async getModuleUrl(name: string, _path: string, _stats: Stats): Promise<string> {
        return new URL(join(this.relativeRoot, this.getActiveNamespace(), name), this.baseUrl).toString()
    }

    protected async getModulePath(name: string, _path: string, _stats: Stats): Promise<string | null> {
        return null
    }
}
