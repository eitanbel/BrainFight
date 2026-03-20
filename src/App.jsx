import { Routes, Route } from 'react-router-dom'
import Home from './components/Home'
import Lobby from './components/Lobby'
import Game from './components/Game'
import Results from './components/Results'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/lobby/:code" element={<Lobby />} />
      <Route path="/game/:code" element={<Game />} />
      <Route path="/results/:code" element={<Results />} />
    </Routes>
  )
}

export default App
