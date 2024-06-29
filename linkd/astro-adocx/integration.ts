import fs from 'node:fs';
import path from 'node:path';

import asciidoctor, { type Asciidoctor, type ProcessorOptions } from 'asciidoctor';
import type { AstroIntegration } from 'astro';
import type { Plugin as VitePlugin } from 'vite';
import {
  compileAstro,
  type CompileAstroResult,
} from './node_modules/astro/dist/vite-plugin-astro/compile.js';

import { register as postProcessorRegisterHandle } from './extensions/postProcessor.ts';
import subSpecialchars from './patches/sub_specialchars';

export type AstroAdocxOptions = {
  astroFenced?: string;
  withAsciidocEngine?: (asciidoctorEngine: Asciidoctor) => void;
};

export type AdocOptions = ProcessorOptions;

const adocxExtension = '.adoc';

function decodeSpecialChars(str: string) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&lbrace;/g, '{')
    .replace(/&rbrace;/g, '}');
}

async function compileAdoc(
  asciidoctorEngine: Asciidoctor,
  fileId: string,
  adocxConfig: AstroAdocxOptions,
  asciidoctorConfig: ProcessorOptions,
) {
  const document = asciidoctorEngine.loadFile(fileId, asciidoctorConfig);
  document.setAttribute('outdir', path.dirname(fileId));

  const converted = document.convert();
  const docattrs = document.getAttributes() as Record<string, string | undefined>;
  const astroFenced = decodeSpecialChars(document.getAttribute('front-matter') ?? '');

  const astroComponent = `---
${(adocxConfig.astroFenced ?? '').trim()}
export let docattrs = ${JSON.stringify(docattrs)};
${astroFenced.trim()}
---
${converted.trim()}
`;
  return astroComponent;
}

export function adocx(
  adocxConfig: AstroAdocxOptions,
  asciidoctorConfig: AdocOptions,
): AstroIntegration {
  let _compileAdoc: (filename: string) => Promise<string>;
  let _compileAstro: (code: string, filename: string) => Promise<CompileAstroResult>;
  return {
    name: '@sransara/astro-adocx',
    hooks: {
      async 'astro:config:setup'({ config: astroConfig, updateConfig, logger }) {
        const asciidoctorEngine = asciidoctor();
        subSpecialchars.patch();

        postProcessorRegisterHandle(asciidoctorEngine.Extensions);
        if (adocxConfig.withAsciidocEngine) {
          adocxConfig.withAsciidocEngine(asciidoctorEngine);
        }

        if (asciidoctorConfig.attributes === undefined) {
          asciidoctorConfig.attributes = {};
        }
        // @ts-expect-error: Ignore error because types are confusing in asciidoctor
        asciidoctorConfig.attributes['skip-front-matter'] = true;

        _compileAdoc = async (filename) => {
          return compileAdoc(asciidoctorEngine, filename, adocxConfig, asciidoctorConfig);
        };

        updateConfig({
          vite: {
            plugins: [
              {
                name: 'vite-astro-adocx',
                enforce: 'pre',
                configResolved(viteConfig) {
                  _compileAstro = (code, filename) => {
                    return compileAstro({
                      compileProps: {
                        astroConfig,
                        viteConfig,
                        preferences: new Map() as any,
                        filename,
                        source: code,
                      },
                      astroFileToCompileMetadata: new Map(),
                      logger: logger as any,
                    });
                  };
                },
                async load(fileId) {
                  if (!fileId.endsWith(adocxExtension)) {
                    return;
                  }
                  const astroComponent = await _compileAdoc(fileId);
                  fs.writeFileSync(fileId.replace(adocxExtension, '.debug.astro'), astroComponent);
                  return {
                    code: astroComponent,
                  };
                },
                async transform(source, fileId) {
                  if (!fileId.endsWith(adocxExtension)) {
                    return;
                  }
                  const astroComponent = source;
                  let transformResult: CompileAstroResult;
                  try {
                    transformResult = await _compileAstro(astroComponent, fileId);
                  } catch (err) {
                    // @ts-expect-error: Try to inject a file id to the error object
                    err.loc.file = `${fileId.replace(adocxExtension, '.astro')}`;
                    throw err;
                  }
                  const astroMetadata = {
                    clientOnlyComponents: transformResult.clientOnlyComponents,
                    hydratedComponents: transformResult.hydratedComponents,
                    scripts: transformResult.scripts,
                    containsHead: transformResult.containsHead,
                    propagation: transformResult.propagation ? 'self' : 'none',
                    pageOptions: {},
                  };
                  return {
                    code: transformResult.code,
                    map: transformResult.map,
                    meta: {
                      astro: astroMetadata,
                      vite: {
                        // Setting this vite metadata to `ts` causes Vite to resolve .js
                        // extensions to .ts files.
                        lang: 'ts',
                      },
                    },
                  };
                },
              },
            ] as VitePlugin[],
          },
        });
      },
    },
  };
}
