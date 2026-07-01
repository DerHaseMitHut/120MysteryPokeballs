import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HostCreatePage } from './routes/HostCreatePage'
import { HostLobbyPage } from './routes/HostLobbyPage'
import { JoinPage } from './routes/JoinPage'
import { PlayPage } from './routes/PlayPage'
import { ObsViewPage } from './routes/ObsViewPage'

function App() {
  return (
    <BrowserRouter>
      <div className="app-background" aria-hidden="true" />
      <Routes>
        <Route path="/" element={<HostCreatePage />} />
        <Route path="/host/:roomId" element={<HostLobbyPage />} />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/play/:code" element={<PlayPage />} />
        <Route path="/obs/:roomId/:token" element={<ObsViewPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
