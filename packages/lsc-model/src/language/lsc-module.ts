import {
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  DefaultValueConverter,
  EmptyFileSystem,
  inject,
  type CstNode,
  type GrammarAST,
  type LangiumCoreServices,
  type LangiumSharedCoreServices,
  type Module,
  type PartialLangiumCoreServices,
  type ValueType,
} from 'langium';
import { LscGeneratedModule, LscGeneratedSharedModule } from './generated/module.js';

/**
 * Strips the keyword from whole-line statements such as `title` and `accDescr`, and the quotes
 * from quoted names. `TEXT`, `AS_LABEL` and the activation terminals stay raw: the builder needs
 * their exact source offsets.
 */
export class LscValueConverter extends DefaultValueConverter {
  protected override runConverter(
    rule: GrammarAST.AbstractRule,
    input: string,
    cstNode: CstNode,
  ): ValueType {
    switch (rule.name) {
      case 'Name':
        return input.startsWith('"') ? input.slice(1, -1) : input;
      case 'TITLE':
        return input.replace(/^[\t ]*title/, '').trim();
      case 'ACC_TITLE':
        return input.replace(/^[\t ]*accTitle[\t ]*:/, '').trim();
      case 'ACC_DESCR':
        return input.replace(/^[\t ]*accDescr[\t ]*:/, '').trim();
      case 'ACC_DESCR_BLOCK':
        return input
          .replace(/^[\t ]*accDescr[\t ]*\{/, '')
          .replace(/\}$/, '')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .join('\n')
          .trim();
      default:
        return super.runConverter(rule, input, cstNode);
    }
  }
}

export type LscServices = LangiumCoreServices;

const LscModule: Module<LscServices, PartialLangiumCoreServices> = {
  parser: {
    ValueConverter: () => new LscValueConverter(),
  },
};

let services: LscServices | undefined;

/** Returns the (lazily created, stateless) Langium services for the LSC language. */
export function lscServices(): LscServices {
  if (!services) {
    const shared: LangiumSharedCoreServices = inject(
      createDefaultSharedCoreModule(EmptyFileSystem),
      LscGeneratedSharedModule,
    );
    services = inject(createDefaultCoreModule({ shared }), LscGeneratedModule, LscModule);
    shared.ServiceRegistry.register(services);
  }
  return services;
}
