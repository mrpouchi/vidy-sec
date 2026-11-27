import { render } from 'preact'
import { App } from './ui/App.tsx'
import { registerWorker } from './ui/push.ts'
import './ui/styles.css'

render(<App />, document.getElementById('app')!)
registerWorker()
