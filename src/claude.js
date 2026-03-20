import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
})

const JSON_FORMAT = `Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ni après. Format : [{"question":"...","choix":["A","B","C","D"],"reponse":0}] où reponse est l'index de la bonne réponse (0, 1, 2 ou 3).`

const PROMPTS = {
  facile: (theme, nombre) =>
    `Génère ${nombre} questions de quiz sur le thème : ${theme}.\nNiveau : très facile, grand public, accessible à des enfants de 10 ans.\nExemples de questions faciles : capitales connues, personnages célèbres, dates historiques majeures, titres de films très connus.\nRéponds avec exactement ${nombre} questions.\n${JSON_FORMAT}`,
  moyen: (theme, nombre) =>
    `Génère ${nombre} questions de quiz sur le thème : ${theme}.\nNiveau : moyen, pour quelqu'un qui s'y connaît un peu mais pas expert.\nLes questions doivent nécessiter une vraie réflexion.\nÉvite les questions trop évidentes dont tout le monde connaît la réponse.\nLes mauvaises réponses proposées doivent être crédibles et proches de la bonne réponse pour que ce soit difficile de deviner.\nRéponds avec exactement ${nombre} questions.\n${JSON_FORMAT}`,
  difficile: (theme, nombre) =>
    `Génère ${nombre} questions de quiz sur le thème : ${theme}.\nNiveau : très difficile, pour de vrais experts du sujet.\nLes questions doivent être pointues, précises, et piégeuses.\nLes mauvaises réponses doivent être très proches de la bonne pour tromper même quelqu'un qui s'y connaît bien.\nÉvite toute question dont la réponse est évidente.\nRéponds avec exactement ${nombre} questions.\n${JSON_FORMAT}`,
}

export async function generateQuestions(theme, difficulte = 'moyen', nombre = 10) {
  const prompt = PROMPTS[difficulte]?.(theme, nombre) || PROMPTS.moyen(theme, nombre)

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  const text = message.content[0].text
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('Réponse invalide de Claude')
  return JSON.parse(match[0])
}
