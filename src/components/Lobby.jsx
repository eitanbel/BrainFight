import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../firebase'
import { generateQuestionsWhoIsThe } from '../claude'
import './Lobby.css'

const MODE_LABELS = {
  classique: '🎯 Classique',
  vrai_ou_faux: '✅ Vrai ou Faux',
  estimation: '🔢 Estimation',
  contre_la_montre: '⚡ Contre la montre',
  qui_est_le_plus: '👥 Qui est le +',
}

export default function Lobby() {
  const { code } = useParams()
  const [searchParams] = useSearchParams()
  const pseudo = searchParams.get('pseudo') || ''
  const navigate = useNavigate()

  const [salon, setSalon] = useState(null)
  const [joueurs, setJoueurs] = useState([])
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    const salonRef = ref(db, `salons/${code}`)
    const unsub = onValue(salonRef, (snap) => {
      if (!snap.exists()) return
      const data = snap.val()
      setSalon(data)
      setJoueurs(Object.keys(data.joueurs || {}))
      if (data.statut === 'en_cours') {
        navigate(`/game/${code}?pseudo=${encodeURIComponent(pseudo)}`)
      }
    })
    return () => unsub()
  }, [code, pseudo, navigate])

  const handleLancer = async () => {
    const updates = { statut: 'en_cours', timerDepart: Date.now() }
    if (salon?.mode === 'contre_la_montre') {
      updates.timerGlobalDepart = Date.now()
    }
    await update(ref(db, `salons/${code}`), updates)
  }

  const handleGenererQuestions = async () => {
    if (joueurs.length < 3 || generating) return
    setGenerating(true)
    try {
      const questions = await generateQuestionsWhoIsThe(joueurs, salon.nombreQuestions || 10)
      await update(ref(db, `salons/${code}`), { questions })
    } catch (err) {
      console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  if (!salon) {
    return <div className="lobby"><p className="lobby-loading">Connexion au salon...</p></div>
  }

  const mode = salon.mode || 'classique'
  const questionsReady = !!salon.questions
  const isQuiEstLePlus = mode === 'qui_est_le_plus'
  const canLaunch = questionsReady

  return (
    <div className="lobby">
      <div className="lobby-hero">
        <p className="lobby-label">Code de la partie</p>
        <div className="lobby-code">{code}</div>
        <p className="lobby-hint">Partage ce code à tes amis !</p>
      </div>

      {/* Mode badge */}
      <div className="lobby-mode-badge">{MODE_LABELS[mode] || mode}</div>

      <div className="lobby-card lobby-info-row">
        {!isQuiEstLePlus && (
          <div>
            <p className="lobby-theme-label">Thème</p>
            <p className="lobby-theme">{salon.theme}</p>
          </div>
        )}
        {!isQuiEstLePlus && (
          <div>
            <p className="lobby-theme-label">Difficulté</p>
            <p className="lobby-difficulty">{salon.difficulte || 'moyen'}</p>
          </div>
        )}
        <div>
          <p className="lobby-theme-label">Questions</p>
          <p className="lobby-difficulty">{salon.nombreQuestions || 10}</p>
        </div>
      </div>

      <div className="lobby-card">
        <p className="lobby-players-title">Joueurs ({joueurs.length})</p>
        <ul className="lobby-players-list">
          {joueurs.map((nom) => (
            <li key={nom} className={`lobby-player ${nom === pseudo ? 'lobby-player-me' : ''}`}>
              <span className="lobby-player-avatar">{nom[0].toUpperCase()}</span>
              <span className="lobby-player-name">{nom}</span>
              {nom === pseudo && <span className="lobby-player-tag">toi</span>}
            </li>
          ))}
        </ul>
      </div>

      {/* Bouton "Générer les questions" pour qui_est_le_plus */}
      {isQuiEstLePlus && !questionsReady && (
        <button
          className="lobby-btn lobby-btn-generate"
          onClick={handleGenererQuestions}
          disabled={joueurs.length < 3 || generating}
        >
          {generating ? '⏳ Génération...' : joueurs.length < 3
            ? `⏳ En attente (min. 3 joueurs, ${joueurs.length}/3)`
            : '✨ Générer les questions'}
        </button>
      )}
      {isQuiEstLePlus && questionsReady && (
        <p className="lobby-questions-ready">✅ Questions générées ! Prêt à jouer.</p>
      )}

      <button
        className="lobby-btn"
        onClick={handleLancer}
        disabled={!canLaunch}
        style={!canLaunch ? { opacity: 0.45, cursor: 'not-allowed' } : {}}
      >
        🚀 Lancer la partie
      </button>

      <p className="lobby-waiting">En attente que la partie commence...</p>
    </div>
  )
}
