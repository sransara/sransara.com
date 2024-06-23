const astroScriptHead = `
import { Image, Picture } from 'astro:assets';
import Katex from '@/src/lib/astro/katex/Katex.astro';
import Shiki from '@/src/lib/astro/shiki/Shiki.astro';
`;

/** @type { import('astro-adocx/integration').AstroAdocxOptions } */
export const adocxConfig = {
  astroScriptHead,
  astroScriptBody: '',
};

/** @type { import('astro-adocx/integration').AdocOptions } */
export const asciidoctorConfig = {
  safe: 'server',
  backend: 'html5',
  standalone: false,
  attributes: {
    xrefstyle: 'full',
    'listing-caption': 'Listing',
    sectanchors: '',
    idprefix: 'id:',
    idseparator: '-',
    icons: 'font',
    stem: 'latexmath',
    toc: 'macro',
    imagesdir: './',
  },
};
