import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../firebase'
import './Lobby.css'

export default function Lobby() {
  const { code } = useParams()
  const [searchParams] = useSearchParams()
  const pseudo = searchParams.get('pseudo') || ''
  const navigate = useNavigate()

  const [salon, setSalon] = useState(null)
  const [joueurs, setJoueurs] = useState([])

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
    await update(ref(db, `salons/${code}`), {
      statut: 'en_cours',
      timerDepart: Date.now(),
    })
  }

  if (!salon) {
    return (
      <div className="lobby">
        <p className="lobby-loading">Connexion au salon...</p>
      </div>
    )
  }

  return (
    <div className="lobby">
      <div className="lobby-hero">
        <p className="lobby-label">Code de la partie</p>
        <div className="lobby-code">{code}</div>
        <p className="lobby-hint">Partage ce code à tes amis !</p>
      </div>

      <div className="lobby-card lobby-info-row">
        <div>
          <p className="lobby-theme-label">Thème</p>
          <p className="lobby-theme">{salon.theme}</p>
        </div>
        <div>
          <p className="lobby-theme-label">Difficulté</p>
          <p className="lobby-difficulty">{salon.difficulte || 'moyen'}</p>
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

      <button className="lobby-btn" onClick={handleLancer}>
        🚀 Lancer la partie
      </button>

      <p className="lobby-waiting">En attente que la partie commence...</p>
    </div>
  )
}
