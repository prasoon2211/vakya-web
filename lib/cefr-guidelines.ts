/**
 * CEFR Level Guidelines for Translation/Adaptation
 *
 * These guidelines are based on:
 * - Common European Framework of Reference for Languages (CEFR)
 * - Goethe Institut curriculum (German)
 * - DELF/DALF curriculum (French)
 * - DELE/Instituto Cervantes curriculum (Spanish)
 *
 * Sources:
 * - https://www.coe.int/en/web/common-european-framework-reference-languages/level-descriptions
 * - https://www.lingoda.com/blog/en/german-language-levels/
 * - https://www.ccfs-sorbonne.fr/en/french-language-levels/
 * - https://www.tellmeinspanish.com/learning/levels-of-spanish/
 */

// =============================================================================
// GENERIC CEFR GUIDELINES (Apply to all languages)
// =============================================================================

export const GENERIC_CEFR_GUIDELINES: Record<string, string> = {
  A1: `## A1 (Beginner) - STRICT SIMPLIFICATION

SENTENCE STRUCTURE:
• Maximum 8-10 words per sentence
• ONLY simple main clauses (Subject-Verb-Object)
• NO subordinate clauses whatsoever
• NO embedded questions
• One idea per sentence

VOCABULARY (~500 words):
• Use only the most basic, high-frequency words
• Concrete nouns only (no abstract concepts)
• Basic verbs: be, have, go, come, want, can, like, eat, drink, see, hear
• Numbers, colors, days, months, family members, common objects
• NO idioms, NO figurative language

TENSES:
• Present tense ONLY
• NO past, NO future tenses

CONNECTORS:
• Limited to: and, or, but
• NO causal connectors (because, so)
• NO temporal connectors (when, before, after)`,

  A2: `## A2 (Elementary) - SIGNIFICANT SIMPLIFICATION

SENTENCE STRUCTURE:
• Maximum 12-15 words per sentence
• At most ONE subordinate clause per sentence
• Simple cause-effect structures allowed
• Break complex sentences into 2-3 shorter ones

VOCABULARY (~1,500 words):
• Everyday vocabulary for routine situations
• Basic emotions and opinions
• Common adjectives and adverbs
• Simple phrasal expressions
• Avoid rare or technical words

TENSES:
• Present tense (primary)
• Simple past (completed actions)
• Basic future expressions (going to / will)

CONNECTORS:
• and, or, but, because, so, when, if (simple)
• First, then, after that (sequencing)
• NO complex logical connectors`,

  B1: `## B1 (Intermediate) - MODERATE SIMPLIFICATION

SENTENCE STRUCTURE:
• Maximum 18-20 words per sentence
• Up to TWO subordinate clauses per sentence
• Relative clauses allowed (simple ones)
• Break sentences with 3+ clauses into shorter ones

VOCABULARY (~3,000 words):
• Express opinions, hopes, plans, experiences
• Abstract concepts (basic level)
• Common collocations and expressions
• Avoid highly specialized vocabulary

TENSES:
• All common tenses including future
• Perfect tenses for experiences
• Conditional for polite requests and hypotheticals

CONNECTORS:
• because, although, even though, so that
• while, during, before, after, until
• however, therefore, moreover (sparingly)`,

  B2: `## B2 (Upper-Intermediate) - LIGHT SIMPLIFICATION

SENTENCE STRUCTURE:
• Maximum 25 words per sentence
• Complex structures allowed
• Only simplify extremely long sentences (4+ nested clauses)
• Maintain paragraph cohesion

VOCABULARY (~5,000 words):
• Nuanced expression of opinions
• Abstract and concrete vocabulary
• Idiomatic expressions allowed
• Some technical/specialized vocabulary OK

TENSES:
• Full range of tenses
• Subjunctive/conditional for hypotheticals
• Passive voice freely used

CONNECTORS:
• Full range of discourse markers
• Maintain text cohesion
• Logical flow between paragraphs`,

  C1: `## C1 (Advanced) - MINIMAL CHANGES

SENTENCE STRUCTURE:
• Near-native complexity allowed
• Preserve original sentence structure where possible
• Only simplify if genuinely incomprehensible
• Maintain author's style and voice

VOCABULARY:
• Advanced vocabulary preserved
• Technical terms maintained with context
• Figurative language and idioms kept
• Literary devices preserved

TENSES & GRAMMAR:
• All grammatical structures permitted
• Nuanced tense usage maintained
• Stylistic choices preserved`,

  C2: `## C2 (Mastery) - PRESERVE ORIGINAL

SENTENCE STRUCTURE:
• Native-level complexity preserved
• Author's style fully maintained
• Literary and journalistic conventions kept
• No simplification needed

VOCABULARY:
• Full vocabulary range including rare words
• Domain-specific terminology preserved
• Cultural references maintained
• Register and tone preserved

TRANSLATION APPROACH:
• Natural, idiomatic translation
• Preserve nuance and subtext
• Maintain rhetorical devices`,
};

// =============================================================================
// GERMAN-SPECIFIC CEFR GUIDELINES
// =============================================================================

export const GERMAN_CEFR_GUIDELINES: Record<string, string> = {
  A1: `## German A1 Grammar Constraints

CASES:
• Nominative case ONLY (subject position)
• NO accusative objects (use simple structures)
• NO dative, NO genitive

WORD ORDER:
• Simple SVO (Subject-Verb-Object) only
• Verb ALWAYS in second position
• NO subordinate clauses (which move verb to end)

VERBS:
• Present tense ONLY (Präsens)
• Regular verbs (-en endings): machen, spielen, lernen
• Key irregular verbs: sein, haben, werden, mögen
• Modal verbs: können, müssen, wollen (simple uses)
• NO separable verbs in complex sentences

ARTICLES:
• der, die, das (nominative only)
• ein, eine (nominative only)
• kein, keine (simple negation)

STRUCTURES TO AVOID:
✗ Passive voice (Das wird gemacht)
✗ Relative clauses (der Mann, der...)
✗ Konjunktiv (würde, hätte, wäre)
✗ Perfekt tense (hat gemacht)
✗ Two-way prepositions with dative`,

  A2: `## German A2 Grammar Constraints

CASES:
• Nominative (subject): der Mann, die Frau, das Kind
• Accusative (direct object): den Mann, die Frau, das Kind
• Dative (simple indirect objects): dem Mann, der Frau, dem Kind
• NO genitive (use "von + dative" instead)

WORD ORDER:
• Main clause: Verb in second position
• Simple subordinate clauses: weil, dass (verb at end)
• Time-Manner-Place order in main clauses

VERBS:
• Present tense (Präsens)
• Perfect tense (Perfekt): hat/ist + Partizip II
• NO Präteritum (except sein/haben)
• Separable verbs: anfangen, aufhören, mitnehmen
• Modal verbs in present: kann, muss, will, soll, darf

CONNECTORS ALLOWED:
• und, oder, aber (coordinating)
• weil (because) - verb at end
• dass (that) - verb at end
• wenn (when/if) - simple conditions

STRUCTURES TO AVOID:
✗ Konjunktiv II (würde + infinitive)
✗ Passive voice
✗ Relative clauses with prepositions
✗ Plusquamperfekt (had done)
✗ Future perfect`,

  B1: `## German B1 Grammar Constraints

CASES:
• All four cases (Nominativ, Akkusativ, Dativ, Genitiv)
• Genitive for possession (des Mannes, der Frau)
• Two-way prepositions (in, an, auf, über, unter, vor, hinter, neben, zwischen)

WORD ORDER:
• Complex main clauses with multiple elements
• Subordinate clauses: weil, dass, wenn, obwohl, damit, nachdem, bevor
• Relative clauses with der/die/das
• Infinitive clauses with "zu"

VERBS:
• Present, Perfect, Präteritum (for common verbs)
• Future I (werden + infinitive)
• Simple Konjunktiv II for polite requests (würde, könnte, möchte)
• Passive voice (Vorgangspassiv: wird gemacht)

ALLOWED STRUCTURES:
• Relative clauses: der Mann, der hier arbeitet
• Indirect questions: Ich weiß nicht, ob er kommt
• Comparative/Superlative: größer als, am größten
• Reflexive verbs: sich freuen, sich erinnern

STRUCTURES TO USE SPARINGLY:
• Konjunktiv I (reported speech)
• Extended adjective constructions
• Participial phrases`,

  B2: `## German B2 Grammar Constraints

FULL GRAMMAR ACCESS with some considerations:

KONJUNKTIV:
• Konjunktiv II freely (wenn ich hätte, wäre, würde)
• Konjunktiv I for reported speech (er sagte, er sei)
• Hypothetical conditions (Wenn ich reich wäre, würde ich...)

PASSIVE VOICE:
• Vorgangspassiv: Das Buch wird gelesen
• Zustandspassiv: Das Fenster ist geöffnet
• Passive with modal verbs: muss gemacht werden

COMPLEX STRUCTURES:
• Extended adjective constructions: der gestern gekaufte Mantel
• Participial phrases: Angekommen in Berlin, rief er an
• Double infinitive: Er hat nicht kommen können
• Relative clauses with prepositions: der Mann, mit dem ich sprach

CONNECTORS:
• Advanced: obgleich, insofern, sofern, indem, wobei
• Two-part: sowohl...als auch, weder...noch, je...desto

SIMPLIFY ONLY:
• Extremely long nested structures (4+ levels)
• Archaic or literary constructions
• Highly technical jargon`,

  C1: `## German C1 Grammar - Near-Native

PRESERVE COMPLEX STRUCTURES:
• All Konjunktiv forms (I and II)
• Partizipialkonstruktionen
• Nominalisierungen (das Lesen, beim Arbeiten)
• Extended adjective constructions

ACADEMIC/JOURNALISTIC REGISTER:
• Formal connectors: dennoch, infolgedessen, dementsprechend
• Passive and impersonal constructions
• Subjunctive in reported speech

MINIMAL INTERVENTION:
• Only simplify genuinely archaic expressions
• Preserve author's stylistic choices
• Maintain register (formal/informal)`,

  C2: `## German C2 Grammar - Mastery

FULL NATIVE COMPLEXITY:
• Literary and journalistic conventions
• Regional variations acceptable
• Historical and archaic forms preserved
• Full idiomatic range

PRESERVE:
• Author's voice and style
• Cultural references
• Wordplay and rhetoric
• Subtle register shifts`,
};

// =============================================================================
// FRENCH-SPECIFIC CEFR GUIDELINES
// =============================================================================

export const FRENCH_CEFR_GUIDELINES: Record<string, string> = {
  A1: `## French A1 Grammar Constraints

VERBS & TENSES:
• Present tense (présent) ONLY
• Regular -er verbs: parler, manger, regarder
• Key irregular verbs: être, avoir, aller, faire
• NO passé composé, NO imparfait, NO futur

PRONOUNS:
• Subject pronouns only: je, tu, il/elle, nous, vous, ils/elles
• NO direct object pronouns (le, la, les)
• NO indirect object pronouns (lui, leur)
• NO reflexive verbs (se laver)

ARTICLES & AGREEMENT:
• Definite: le, la, l', les
• Indefinite: un, une, des
• Basic gender agreement (masculine/feminine)
• Basic number agreement (singular/plural)

NEGATION:
• ne...pas ONLY
• NO ne...jamais, ne...plus, ne...rien

STRUCTURES TO AVOID:
✗ Questions with inversion (Vient-il?)
✗ Object pronouns before verb
✗ Relative clauses (qui, que)
✗ Any compound tenses`,

  A2: `## French A2 Grammar Constraints

VERBS & TENSES:
• Present tense (présent)
• Passé composé (with avoir and être)
• Imparfait (for descriptions and habits)
• Futur proche (aller + infinitive)
• NO passé simple, NO plus-que-parfait

PASSÉ COMPOSÉ RULES:
• Use avoir for most verbs: j'ai mangé, tu as parlé
• Use être for: DR & MRS VANDERTRAMP verbs + reflexives
• Agreement with être: elle est allée, ils sont partis

IMPARFAIT VS PASSÉ COMPOSÉ:
• Imparfait: descriptions, habits, ongoing states (Il faisait beau)
• Passé composé: completed actions (J'ai mangé)

PRONOUNS:
• Direct object: le, la, les (J'aime ce livre → Je l'aime)
• Indirect object: lui, leur (Je parle à Marie → Je lui parle)
• Reflexive verbs: se lever, se coucher

CONNECTORS:
• parce que, donc, alors, quand, si (simple)
• NO bien que, quoique (require subjunctive)

STRUCTURES TO AVOID:
✗ Subjonctif (any form)
✗ Conditionnel passé
✗ Plus-que-parfait
✗ Complex relative clauses (dont, lequel)`,

  B1: `## French B1 Grammar Constraints

VERBS & TENSES:
• All indicative tenses:
  - Présent, Passé composé, Imparfait
  - Plus-que-parfait (for past before past)
  - Futur simple (je parlerai)
  - Conditionnel présent (je parlerais)
• Basic subjonctif présent after common triggers

SUBJONCTIF (limited use):
• After: il faut que, je veux que, pour que
• After: je ne pense pas que, je doute que
• Common verbs only: être (soit), avoir (ait), faire (fasse), aller (aille)

CONDITIONNEL:
• Polite requests: Je voudrais, Pourriez-vous
• Hypothetical present: Si j'avais de l'argent, j'achèterais...
• NO conditionnel passé (j'aurais fait)

SI CLAUSES:
• Si + présent → futur: Si tu viens, je serai content
• Si + imparfait → conditionnel: Si j'avais de l'argent, j'achèterais
• NO Si + plus-que-parfait (too complex)

RELATIVE PRONOUNS:
• qui (subject): L'homme qui parle
• que (direct object): Le livre que je lis
• où (place/time): La ville où j'habite
• NO dont, lequel, auquel (advanced)

PRONOUNS:
• Y (replaces à + thing): J'y vais
• En (replaces de + thing): J'en ai trois`,

  B2: `## French B2 Grammar Constraints

FULL TENSE SYSTEM:
• All indicative tenses
• Subjonctif présent and passé
• Conditionnel présent and passé
• Futur antérieur

SUBJONCTIF (full use):
• After all subjunctive triggers
• Subjonctif passé: Je suis content qu'il soit venu
• Common irregular forms

SI CLAUSES (complete):
• Si + plus-que-parfait → conditionnel passé
  Example: Si j'avais su, je serais venu
• All three si clause types

RELATIVE PRONOUNS (full):
• dont: L'homme dont je parle
• lequel, laquelle, lesquels, lesquelles
• auquel, duquel, etc.

PASSIVE VOICE:
• être + past participle: Le livre est écrit par l'auteur
• Agent introduced by "par"

DISCOURSE COHESION:
• Advanced connectors: néanmoins, cependant, toutefois
• En effet, d'ailleurs, par ailleurs
• D'une part...d'autre part

REPORTED SPEECH:
• Tense concordance: Il a dit qu'il viendrait`,

  C1: `## French C1 Grammar - Near-Native

PRESERVE COMPLEX STRUCTURES:
• All subjunctive forms including imparfait du subjonctif (literary)
• Complex conditional structures
• Nominalizations

LITERARY/JOURNALISTIC REGISTER:
• Passé simple (for written narrative)
• Formal connectors: en outre, par conséquent, en revanche
• Impersonal constructions: Il est à noter que...

STYLISTIC ELEMENTS:
• Inversion for emphasis
• Dislocation (topic-comment)
• Register variations`,

  C2: `## French C2 Grammar - Mastery

FULL NATIVE COMPLEXITY:
• All literary tenses (passé simple, imparfait du subjonctif)
• Formal and informal registers
• Regional variations
• Historical forms

PRESERVE:
• Author's style and voice
• Rhetorical devices
• Cultural references and wordplay
• Subtle nuances`,
};

// =============================================================================
// SPANISH-SPECIFIC CEFR GUIDELINES
// =============================================================================

export const SPANISH_CEFR_GUIDELINES: Record<string, string> = {
  A1: `## Spanish A1 Grammar Constraints

VERBS & TENSES:
• Present tense (presente) ONLY
• Regular -ar verbs: hablar, trabajar, estudiar
• Regular -er verbs: comer, beber, leer
• Regular -ir verbs: vivir, escribir, abrir
• Key irregulars: ser, estar, tener, ir, hacer
• NO past tenses, NO future

SER vs ESTAR:
• Ser: identity, origin, profession (Soy profesor, Es de España)
• Estar: location, temporary states (Estoy en casa, Está cansado)
• Keep it simple - avoid edge cases

PRONOUNS:
• Subject pronouns: yo, tú, él/ella, nosotros, vosotros, ellos/ellas
• NO direct object pronouns (lo, la, los, las)
• NO indirect object pronouns (le, les)
• NO reflexive verbs (levantarse)

ARTICLES & AGREEMENT:
• Definite: el, la, los, las
• Indefinite: un, una, unos, unas
• Gender and number agreement

STRUCTURES TO AVOID:
✗ Any past tense
✗ Subjunctive (any form)
✗ Object pronouns
✗ Reflexive verbs
✗ Compound tenses`,

  A2: `## Spanish A2 Grammar Constraints

VERBS & TENSES:
• Presente (present)
• Pretérito indefinido (simple past): Ayer comí, Fui al cine
• Pretérito perfecto (present perfect): He comido, Has visto
• Pretérito imperfecto (imperfect): Cuando era niño, Hacía calor
• Estar + gerundio (present progressive): Estoy comiendo
• Ir a + infinitive (near future): Voy a comer
• NO futuro simple, NO condicional, NO subjuntivo

INDEFINIDO vs IMPERFECTO:
• Indefinido: completed actions (Ayer comí pizza)
• Imperfecto: descriptions, habits (Era alto, Siempre comía pizza)

REFLEXIVE VERBS:
• levantarse, acostarse, ducharse, vestirse
• Correct pronoun placement: me levanto, te duchas

OBJECT PRONOUNS:
• Direct: lo, la, los, las (Lo veo = I see it/him)
• Indirect: le, les (Le doy el libro = I give him the book)
• Placement before conjugated verb

COMPARATIVES:
• más...que, menos...que, tan...como
• mejor, peor, mayor, menor

STRUCTURES TO AVOID:
✗ Subjunctive (any form)
✗ Conditional (condicional)
✗ Future simple (futuro)
✗ Pluscuamperfecto`,

  B1: `## Spanish B1 Grammar Constraints

VERBS & TENSES:
• All indicative tenses:
  - Presente, Pretérito indefinido, Imperfecto
  - Pretérito perfecto
  - Futuro simple (hablaré)
  - Condicional simple (hablaría)
  - Pluscuamperfecto (había hablado)
• Presente de subjuntivo (basic uses)
• Imperativo (commands)

SUBJUNTIVO (limited):
• After: querer que, esperar que, pedir que
• After: es importante que, es necesario que
• After: no creo que, dudo que
• After: para que, antes de que
• Regular forms only - avoid highly irregular

SI CLAUSES:
• Si + presente → presente/futuro
  Example: Si llueve, me quedo en casa
• NO si + imperfecto de subjuntivo (too advanced)

IMPERATIVO:
• Affirmative: habla, come, vive (tú forms)
• Negative with subjunctive: no hables, no comas
• Ustedes forms: hablen, coman

RELATIVE PRONOUNS:
• que (most common): El libro que leí
• donde: La ciudad donde vivo
• quien (for people): La persona con quien hablé

CONNECTORS:
• aunque, sin embargo, por eso, por lo tanto
• mientras, después de que, antes de que`,

  B2: `## Spanish B2 Grammar Constraints

FULL SUBJUNCTIVE SYSTEM:
• Presente de subjuntivo (all uses)
• Pretérito perfecto de subjuntivo: Espero que hayas comido
• Imperfecto de subjuntivo: Quería que vinieras
• Use after emotions, doubt, wishes, impersonal expressions

SI CLAUSES (complete):
• Si + imperfecto subjuntivo → condicional
  Example: Si tuviera dinero, viajaría
• Si + pluscuamperfecto subjuntivo → condicional compuesto
  Example: Si hubiera sabido, habría venido

PASSIVE VOICE:
• Ser + participio: El libro fue escrito por Cervantes
• Pasiva refleja: Se venden coches, Se habla español

RELATIVE CLAUSES:
• Full range: que, quien, el cual, cuyo
• With prepositions: en el que, del que, con quien

DISCOURSE:
• Advanced connectors: no obstante, en cambio, de hecho
• por un lado...por otro lado
• Reported speech with tense changes

SUBJUNTIVO TRIGGERS:
• como si + imperfecto subjuntivo
• aunque + subjuntivo (for hypothetical)
• ojala + subjuntivo (wishes)`,

  C1: `## Spanish C1 Grammar - Near-Native

ADVANCED SUBJUNCTIVE:
• Pluscuamperfecto de subjuntivo: Si hubiera podido...
• Complex hypothetical chains
• Subtle mood distinctions

FORMAL REGISTER:
• Formal connectors: asimismo, en lo que respecta a
• Passive constructions
• Nominalizations

PRESERVE:
• Regional variations (vosotros vs ustedes, tenses)
• Register shifts
• Idiomatic expressions
• Stylistic choices`,

  C2: `## Spanish C2 Grammar - Mastery

FULL NATIVE COMPLEXITY:
• All tenses and moods
• Literary past tenses
• Regional dialectal features
• Formal and colloquial registers

PRESERVE:
• Author's voice and style
• Cultural references
• Wordplay and idioms
• Rhetorical devices`,
};

// =============================================================================
// HELPER FUNCTION TO GET COMBINED GUIDELINES
// =============================================================================

/**
 * Get the combined CEFR guidelines for a specific language and level
 * Returns both generic and language-specific guidelines
 */
export function getCefrGuidelines(language: string, level: string): string {
  const normalizedLevel = level.toUpperCase();
  const normalizedLang = language.toLowerCase();

  // Get generic guidelines
  const genericGuideline = GENERIC_CEFR_GUIDELINES[normalizedLevel] || GENERIC_CEFR_GUIDELINES.B1;

  // Get language-specific guidelines
  let languageGuideline = '';

  if (normalizedLang.includes('german') || normalizedLang.includes('deutsch')) {
    languageGuideline = GERMAN_CEFR_GUIDELINES[normalizedLevel] || GERMAN_CEFR_GUIDELINES.B1;
  } else if (normalizedLang.includes('french') || normalizedLang.includes('français') || normalizedLang.includes('francais')) {
    languageGuideline = FRENCH_CEFR_GUIDELINES[normalizedLevel] || FRENCH_CEFR_GUIDELINES.B1;
  } else if (normalizedLang.includes('spanish') || normalizedLang.includes('español') || normalizedLang.includes('espanol')) {
    languageGuideline = SPANISH_CEFR_GUIDELINES[normalizedLevel] || SPANISH_CEFR_GUIDELINES.B1;
  }

  // Combine: Generic first, then language-specific
  if (languageGuideline) {
    return `${genericGuideline}\n\n${languageGuideline}`;
  }

  // For unsupported languages, return generic only
  return genericGuideline;
}

/**
 * Get just the language-specific guidelines
 */
export function getLanguageSpecificGuidelines(language: string, level: string): string | null {
  const normalizedLevel = level.toUpperCase();
  const normalizedLang = language.toLowerCase();

  if (normalizedLang.includes('german') || normalizedLang.includes('deutsch')) {
    return GERMAN_CEFR_GUIDELINES[normalizedLevel] || null;
  } else if (normalizedLang.includes('french') || normalizedLang.includes('français') || normalizedLang.includes('francais')) {
    return FRENCH_CEFR_GUIDELINES[normalizedLevel] || null;
  } else if (normalizedLang.includes('spanish') || normalizedLang.includes('español') || normalizedLang.includes('espanol')) {
    return SPANISH_CEFR_GUIDELINES[normalizedLevel] || null;
  }

  return null;
}
