// Studio service copy — the single source for /services/<slug>/ and /start/.
//
// This lives in its own module rather than in the page frontmatter because
// Astro hoists getStaticPaths() into a separate scope at build time, where a
// const declared in the frontmatter is not visible ("SERVICES is not defined").
// Importing it also keeps the /start chooser from drifting out of sync with
// the pages it links to.

export interface Service {
  slug: string;
  num: string;
  title: string;
  /** One-line summary, shown under the H1. */
  lede: string;
  /** Opening paragraphs, set two-up. */
  intro: string[];
  includes: { name: string; note: string }[];
  steps: { name: string; note: string }[];
  metaDesc: string;
  /** Situational line for the /start chooser — "which sounds like you?" */
  prompt: string;
}

export const SERVICES: Service[] = [
  {
    slug: 'branding',
    num: '01',
    title: 'Branding',
    lede: 'The foundation everything else is built on. Get this right and every piece that follows looks like it belongs to you.',
    prompt: 'You have outgrown the logo you started with, or nothing looks like it belongs together.',
    intro: [
      'A brand is not a logo. It is the whole impression someone forms in the first few seconds — the mark, the colour, the type, the tone, and how consistently all of it holds together across every place a person meets you.',
      'I build brands for businesses that have outgrown whatever they started with. Usually that means a mark drawn by somebody’s nephew in 2009, three different blues in circulation, and a brochure that looks unrelated to the website. The work is to make all of it one thing.',
    ],
    includes: [
      { name: 'Logo and marks', note: 'A primary mark plus the variants you actually need — stacked, horizontal, single-colour, favicon, and the small sizes most logos fall apart at.' },
      { name: 'Colour and type', note: 'A palette and typeface system with real rules: what leads, what supports, and what never gets used together.' },
      { name: 'Brand guidelines', note: 'A working document your printer, your web developer, and your next hire can all follow without calling me.' },
      { name: 'Voice and naming', note: 'How the brand sounds in a headline, a caption, and an apology. Naming work where a product or division needs one.' },
      { name: 'Rollout', note: 'Applying the system to the pieces that matter first — signage, stationery, vehicle, site — so the change is visible rather than theoretical.' },
    ],
    steps: [
      { name: 'Listen', note: 'What the business actually does, who buys, and where the current brand is costing you credibility.' },
      { name: 'Direction', note: 'Two or three distinct routes, presented in context — on a truck, on a booth, on a phone — not as logos floating on white.' },
      { name: 'Build', note: 'Refine the chosen route into a full system, including the edge cases nobody thinks about until launch week.' },
      { name: 'Hand over', note: 'Files in every format you will need, plus guidelines, plus a walkthrough so your team knows how to use them.' },
    ],
    metaDesc: 'Brand identity design — logos, colour and type systems, guidelines, naming, and rollout. Twenty-three years of building brands that refuse to blend in.',
  },
  {
    slug: 'print-signage',
    num: '02',
    title: 'Print & signage',
    lede: 'The work people pick up, walk past, and walk through. Physical pieces that have to survive contact with the real world.',
    prompt: 'You need something physical — a brochure, packaging, a wrap, a booth, a sign.',
    intro: [
      'Print is unforgiving. There is no revision after it ships, no hotfix on a vehicle wrap, no A/B test on a tradeshow booth. It has to be right the first time, which means understanding the production process as well as the design.',
      'I have been specifying print since 2003 and working with fabricators and installers the whole way. That matters when a file has to survive being scaled to the side of a building.',
    ],
    includes: [
      { name: 'Brochures and catalogues', note: 'Multi-page pieces with a real information hierarchy, set up properly for the press that is printing them.' },
      { name: 'Business cards and stationery', note: 'The pieces that get handed over in person, where stock and finish do as much work as the design.' },
      { name: 'Packaging', note: 'Dielines, print-ready artwork, and shelf presence — designed against the competitors it will actually sit beside.' },
      { name: 'Vehicle wraps', note: 'Templated to the exact make and model, with the message legible at speed and the seams falling where they should.' },
      { name: 'Tradeshow booths', note: 'Large-format graphics, structure, and the sightlines that decide whether people stop walking.' },
      { name: 'Wayfinding and signage', note: 'Interior and exterior systems that stay readable at distance and hold up outdoors.' },
    ],
    steps: [
      { name: 'Specify', note: 'Sizes, stocks, finishes, quantities, and production method — before any design happens, because it changes the design.' },
      { name: 'Design', note: 'Concepts shown at real scale and in context, not as thumbnails on a screen.' },
      { name: 'Prepress', note: 'Bleeds, trims, colour profiles, dielines. Files your printer opens without sending questions back.' },
      { name: 'Press check', note: 'On the important runs, I check the first sheets so a colour shift does not become ten thousand pieces.' },
    ],
    metaDesc: 'Print and signage design — brochures, packaging, business cards, vehicle wraps, tradeshow booths, and wayfinding, prepared production-ready.',
  },
  {
    slug: 'web',
    num: '03',
    title: 'Web',
    lede: 'Custom sites that load fast and make a small operation look like the obvious choice. Not a template — and live sooner than a traditional studio would manage.',
    prompt: 'Your site is slow, dated, or fighting you every time you try to change it.',
    intro: [
      'Most small-business websites fail for the same two reasons: they are slow, and they were built from a template that fights every attempt to make them specific. Both problems are fixable, and neither requires an enterprise budget.',
      'I design and build the site myself, which removes the usual gap between the design that was approved and the site that shipped. If it looked right in the comp, it looks right live.',
    ],
    includes: [
      { name: 'Design', note: 'Laid out for your content and your buyers, not a demo. Designed responsive from the start rather than squeezed down afterwards.' },
      { name: 'Build', note: 'Hand-built front end, tuned for speed. Fast sites rank better and convert better; this is not a nice-to-have.' },
      { name: 'WordPress', note: 'When you need to edit it yourself, the back end gets organised so that editing is genuinely straightforward.' },
      { name: 'Content and imagery', note: 'Photography, video, and copy direction, so launch is not held up waiting on assets.' },
      { name: 'Launch and aftercare', note: 'Redirects, analytics, search setup, and someone to call when something needs changing.' },
    ],
    steps: [
      { name: 'Map', note: 'What pages exist, what each one has to accomplish, and what a visitor should do next.' },
      { name: 'Design', note: 'Key templates designed to real content, reviewed on a phone as well as a desktop.' },
      { name: 'Build', note: 'Built, tested across browsers and devices, and checked for speed and accessibility before launch.' },
      { name: 'Launch', note: 'Migration, redirects from the old URLs so search rankings survive, then monitoring for the first weeks.' },
    ],
    metaDesc: 'Custom website design and build — fast, responsive, hand-built sites with organised WordPress back ends. No templates.',
  },
  {
    slug: 'video',
    num: '04',
    title: 'Video',
    lede: 'Short-form and motion content produced end to end — shot, cut, and scored in-house, so it lands as one finished piece instead of stock footage on a stock track.',
    prompt: 'You need motion — a hero film, social cuts, product animation, a score.',
    intro: [
      'Video usually arrives assembled from parts: one company shoots, another edits, a third licenses music that a thousand other brands are also using. The result is competent and completely forgettable.',
      'I run the whole chain — concept, shoot, edit, colour, motion, and original score. Twenty years behind instruments means the music is written for your piece rather than chosen from a dropdown.',
    ],
    includes: [
      { name: 'Concept and script', note: 'What the piece is for, who it is aimed at, and the shape it needs to take to hold attention.' },
      { name: 'Production', note: 'Shooting on location or on site, with lighting and audio handled properly rather than fixed later.' },
      { name: 'Editing and colour', note: 'Cut for pace and graded so it looks deliberate. The difference between footage and a film.' },
      { name: 'Motion graphics', note: 'Titles, lower thirds, product animation, and explanatory sequences built in your brand system.' },
      { name: 'Original score and sound', note: 'Music composed for the piece, plus sound design and mix. No library tracks unless you want one.' },
      { name: 'Delivery', note: 'Cut down for every placement you need — hero film, social verticals, tradeshow loops, pre-roll.' },
    ],
    steps: [
      { name: 'Plan', note: 'Concept, script, shot list, and logistics agreed before anyone picks up a camera.' },
      { name: 'Shoot', note: 'A tight crew and a clear plan, so shoot days stay short and the footage is usable.' },
      { name: 'Post', note: 'Edit, colour, motion, and score, with review rounds at defined points rather than open-ended.' },
      { name: 'Deliver', note: 'Every format and aspect ratio you need, plus the project files archived.' },
    ],
    metaDesc: 'Video production end to end — concept, shooting, editing, colour, motion graphics, and original score composed in-house.',
  },
  {
    slug: 'retainer',
    num: '05',
    title: 'A studio on call',
    lede: 'Already have all of the above? Keep someone on hand who knows your brand — updates, campaigns, and new pieces without starting from a blank brief.',
    prompt: 'The brand exists. You just need someone who knows it, on hand, every month.',
    intro: [
      'Once the brand exists and the site is live, the work does not stop; it changes shape. A new product sheet, a trade ad, a landing page, a booth refresh, a video cut down for a new channel. Individually small, collectively constant.',
      'A retainer means those pieces get made by someone who already knows the system, the files, the printers, and the history — so nothing needs re-explaining and nothing drifts off-brand.',
    ],
    includes: [
      { name: 'Agreed monthly hours', note: 'A block of studio time reserved for you each month, across any of the five disciplines.' },
      { name: 'Priority turnaround', note: 'Retainer work goes to the front of the queue. Urgent things stay possible.' },
      { name: 'Brand custody', note: 'I hold the master files and guidelines, so every new piece stays consistent with everything before it.' },
      { name: 'No re-briefing', note: 'No onboarding, no explaining your business again, no rediscovery fee on every project.' },
      { name: 'Planning', note: 'A standing check-in to look at what is coming, so the work is scheduled rather than scrambled.' },
    ],
    steps: [
      { name: 'Assess', note: 'What you produced over the last year and what is realistically coming.' },
      { name: 'Size it', note: 'A monthly block that fits the actual demand, reviewed after the first quarter.' },
      { name: 'Run it', note: 'Work requested as needed, tracked against the block, with a summary each month.' },
      { name: 'Adjust', note: 'Scale up or down as the year moves. No penalty for a quiet month.' },
    ],
    metaDesc: 'Design retainer — reserved monthly studio time across print, web, video, photo, and audio, with priority turnaround and no re-briefing.',
  },
];
