import { useEffect, useState } from 'preact/hooks'

/** Événement Chrome/Android (pas encore dans lib.dom). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED = 'vidy:install-dismissed:v1'

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPadOS se présente en Mac

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED) === '1'
  } catch {
    return false
  }
}

function ShareIcon() {
  return (
    <svg class="share-icon" viewBox="0 0 16 20" width="14" height="17" aria-label="Partager" role="img">
      <path
        d="M8 1.5v11M4.5 5 8 1.5 11.5 5M5.5 8H3.5a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-2"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  )
}

/** Invite à installer l'app : gestes Safari sur iPhone, bouton natif sur Android. Rien une fois installée. */
export function InstallHint() {
  const [mode, setMode] = useState<'ios' | 'android' | null>(() =>
    isStandalone() || wasDismissed() ? null : isIOS() ? 'ios' : null,
  )
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [demo, setDemo] = useState(false)

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as InstallPromptEvent)
      setMode('android')
    }
    const onInstalled = () => setMode(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!mode) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED, '1')
    } catch {
      /* navigation privée : on masque juste pour cette visite */
    }
    setMode(null)
  }

  const install = async () => {
    if (!prompt) return
    await prompt.prompt()
    await prompt.userChoice
    // L'événement ne sert qu'une fois : on masque l'encart (sans le mémoriser si l'install est refusée).
    setPrompt(null)
    setMode(null)
  }

  return (
    <section class="card install" aria-label="Installer l’app">
      <img class="install-icon" src={`${import.meta.env.BASE_URL}apple-touch-icon.png`} alt="" width="40" height="40" />
      <div class="install-text">
        <p class="install-title">Installe Spot Checker</p>
        {mode === 'ios' ? (
          <>
            <p class="install-steps">
              Menu <ShareIcon /> Partager, puis « Sur l’écran d’accueil » pour recevoir les notifications.
            </p>
            {!demo && (
              <button type="button" class="text-btn install-btn" onClick={() => setDemo(true)}>
                Voir comment (12 s)
              </button>
            )}
          </>
        ) : (
          <p class="install-steps">Pour l’ouvrir en un geste et recevoir les notifications.</p>
        )}
        {mode === 'android' && (
          <button type="button" class="text-btn install-btn" onClick={() => void install()}>
            Installer
          </button>
        )}
      </div>
      {demo && (
        <video
          class="install-video"
          src={`${import.meta.env.BASE_URL}install.mp4`}
          poster={`${import.meta.env.BASE_URL}install-poster.jpg`}
          width="390"
          height="844"
          autoplay
          muted
          loop
          playsInline
          aria-label="Vidéo : ajouter Spot Checker à l’écran d’accueil depuis Safari"
        />
      )}
      <button type="button" class="install-close" aria-label="Fermer" onClick={dismiss}>
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </button>
    </section>
  )
}
