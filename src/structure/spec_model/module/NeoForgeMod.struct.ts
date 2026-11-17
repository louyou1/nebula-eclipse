import { Stats } from 'fs'
import { Type } from 'helios-distribution-types'
import { join } from 'path'
import { URL } from 'url'
import { MinecraftVersion } from '../../../util/MinecraftVersion.js'
import { UntrackedFilesOption } from '../../../model/nebula/ServerMeta.js'
import { ToggleableModuleStructure } from './ToggleableModule.struct.js'

/**
 * Creates toggleable NeoForge jar modules stored outside the live mods/ directory.
 * The launcher copies only enabled modules into mods/ immediately before launch.
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
            Type.File,
            untrackedFiles,
            (name: string) => name.toLowerCase().endsWith('.jar')
        )
    }

    public getLoggerName(): string {
        return 'NeoForgeModStructure'
    }

    protected async getModuleId(name: string, _path: string): Promise<string> {
        const stablePath = `${this.getActiveNamespace()}/${name}`
        return `neoforge-mod-${Buffer.from(stablePath).toString('base64url')}`
    }

    protected async getModuleName(name: string, _path: string): Promise<string> {
        return name.replace(/\.jar$/i, '')
    }

    protected async getModuleUrl(name: string, _path: string, _stats: Stats): Promise<string> {
        return new URL(join(this.relativeRoot, this.getActiveNamespace(), name), this.baseUrl).toString()
    }

    protected async getModulePath(name: string, _path: string, _stats: Stats): Promise<string | null> {
        return join('neoforge-mods', this.getActiveNamespace(), name).replace(/\\/g, '/')
    }
}
