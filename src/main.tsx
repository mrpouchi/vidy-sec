import { render } from 'preact'
import { App } from './ui/App.tsx'
import { ping } from './ui/ping.ts'
import { registerWorker } from './ui/push.ts'
import { adoptSpotsFromUrl } from './ui/storage.ts'
import './ui/styles.css'

adoptSpotsFromUrl() // avant le premier rendu : pas d'écran de bienvenue si le choix arrive par l'adresse
render(<App />, document.getElementById('app')!)
registerWorker()
ping()
