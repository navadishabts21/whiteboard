
import {
  Tldraw,
  createTLStore,
  defaultShapeUtils,
  getSnapshot,
  loadSnapshot,
} from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'
import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'

// Use a more reliable worker source
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

export default function App() {
  const [slides, setSlides] = useState([null]) // Start with one blank slide
  const [currIdx, setCurrIdx] = useState(0)
  const [dark, setDark] = useState(true)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const editorRef = useRef(null)

  // Map of slide index to their respective snapshots
  const [snapshots, setSnapshots] = useState({})
  const [isLocked, setIsLocked] = useState(true)

  const saveCurrentSnapshot = (index = currIdx) => {
    if (editorRef.current && slides.length > 0) {
      const snapshot = getSnapshot(editorRef.current.store)
      setSnapshots(prev => ({ ...prev, [index]: snapshot }))
    }
  }

  const handleFileUpload = async (e) => {
    e.preventDefault()
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    setLoading(true)
    setStatus('Preparing...')
    console.log(`--- Upload Started: ${files.length} files selected ---`)
    alert(`Starting upload of ${files.length} files. Check browser console for details.`);
    const newTotalSlides = []

    try {
      for (const file of files) {
        if (file.type === 'application/pdf') {
          setStatus('Reading PDF...')
          const arrayBuffer = await file.arrayBuffer()
          const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
          const pdf = await loadingTask.promise
          const numPages = pdf.numPages
          console.log(`PDF loaded. Total Pages: ${numPages}`)

          for (let i = 1; i <= numPages; i++) {
            setStatus(`Processing page ${i}/${numPages}...`)
            const page = await pdf.getPage(i)
            // Use scale 2 for high detail without too much memory
            const viewport = page.getViewport({ scale: 2 })
            const canvas = document.createElement('canvas')
            const context = canvas.getContext('2d')
            canvas.height = viewport.height
            canvas.width = viewport.width

            await page.render({ canvasContext: context, viewport }).promise
            const base64 = canvas.toDataURL('image/png')
            console.log(`Page ${i} converted to Base64 (${canvas.width}x${canvas.height})`)
            newTotalSlides.push({ image: base64, w: canvas.width, h: canvas.height })
          }
        } else if (file.type.startsWith('image/')) {
          setStatus('Processing Image...')
          const reader = new FileReader()
          const data = await new Promise((resolve) => {
            reader.onload = async (e) => {
              const base64 = e.target.result
              const img = new Image()
              img.onload = () => resolve({ image: base64, w: img.width, h: img.height })
              img.src = base64
            }
            reader.readAsDataURL(file)
          })
          newTotalSlides.push(data)
        }
      }

      if (newTotalSlides.length > 0) {
        const resetRequired = slides.length === 1 && slides[0] === null
        const startIdx = resetRequired ? 0 : slides.length

        if (resetRequired) {
          setSlides(newTotalSlides)
          setSnapshots({}) // CRITICAL: Clear snapshots so the PDF backgrounds are created fresh
        } else {
          setSlides(prev => [...prev, ...newTotalSlides])
        }
        setCurrIdx(startIdx)
        console.log(`Added ${newTotalSlides.length} new slides. Switching to index ${startIdx}`)
      }
    } catch (error) {
      console.error('Upload Error:', error)
      alert('Upload failed: ' + error.message)
    } finally {
      setLoading(false)
      setStatus('')
    }
  }

  const goToSlide = (index) => {
    if (index < 0 || index >= slides.length) return
    saveCurrentSnapshot()
    setCurrIdx(index)
  }

  const addNewSlide = () => {
    saveCurrentSnapshot()
    const nextIdx = slides.length
    setSlides([...slides, null])
    setCurrIdx(nextIdx)
  }

  const [isEditorReady, setIsEditorReady] = useState(false)

  // Effect to load slide snapshot
  useEffect(() => {
    // We only need the editor to be ready to load a snapshot or set up a background
    console.log(`useEffect: slide ${currIdx + 1}, Editor Ready: ${isEditorReady}, Slides: ${slides.length}`)

    if (!editorRef.current || !isEditorReady) {
      console.log("Effect skipped: Editor not ready.")
      return
    }

    const editor = editorRef.current
    const targetSnapshot = snapshots[currIdx]

    if (targetSnapshot) {
      console.log(`Restoring snapshot for slide ${currIdx + 1}`)
      try {
        loadSnapshot(editor.store, targetSnapshot)
      } catch (e) {
        console.error("Failed to load snapshot", e)
      }
    } else if (slides.length > 0) {
      console.log(`Initial setup for slide ${currIdx + 1}.`)
      // Clear existing shapes for a fresh start
      editor.selectAll().deleteShapes(editor.getSelectedShapeIds())

      const slideData = slides[currIdx]
      if (slideData) {
        const imageUrl = typeof slideData === 'string' ? slideData : slideData.image
        const w = (typeof slideData === 'object' ? slideData.w : 1200) || 1200
        const h = (typeof slideData === 'object' ? slideData.h : 800) || 800

        console.log(`Adding background asset for slide ${currIdx + 1} (${w}x${h})`)
        const assetId = `asset:slide-bg-${currIdx}-${Date.now()}`

        try {
          editor.store.put([{
            id: assetId,
            typeName: 'asset',
            type: 'image',
            props: {
              src: imageUrl,
              w: w,
              h: h,
              name: `Slide Background ${currIdx + 1}`,
              isAnimated: false,
              mimeType: 'image/png'
            },
            meta: {}
          }])
        } catch (assetErr) {
          console.error("Manual asset injection failed:", assetErr)
        }

        const id = `shape:slide-bg-${currIdx}-${Date.now()}`
        editor.createShape({
          id,
          type: 'image',
          x: 0,
          y: 0,
          props: {
            w: w,
            h: h,
            assetId: assetId,
          },
        })

        console.log(`Created background shape ${id}`)
        editor.toggleLock([id])

        // Use zoomToFit to center the page perfectly
        // We wrap it in a small timeout to ensure the shape is rendered first
        setTimeout(() => {
          editor.zoomToFit({ animation: { duration: 0 } })
        }, 50)
      } else {
        console.log("No background image for this slide, starting blank.")
        editor.setCamera({ x: 0, y: 0, z: 1 })
      }

      editor.selectNone()
      setIsLocked(true)

      // Save this initial state immediately so we don't lose it
      const initialSnapshot = getSnapshot(editor.store)
      setSnapshots(prev => ({ ...prev, [currIdx]: initialSnapshot }))
    }
  }, [currIdx, slides, snapshots, isEditorReady])

  const exportPNG = async () => {
    const editor = editorRef.current
    if (!editor) return

    try {
      const svg = await editor.getSvg([...editor.getCurrentPageShapeIds()])
      if (!svg) return

      const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)

      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const pngUrl = canvas.toDataURL('image/png')
        const a = document.createElement('a')
        a.href = pngUrl
        a.download = `whiteboard-export-${currIdx + 1}.png`
        a.click()
        URL.revokeObjectURL(url)
      }
      img.src = url
    } catch (err) {
      console.error("Export failed", err)
    }
  }

  const toggleSlideLock = () => {
    if (editorRef.current) {
      const editor = editorRef.current
      const shapes = editor.getCurrentPageShapes()
      const slideBG = shapes.find(s => s.id.includes('slide-bg-'))
      if (slideBG) {
        editor.toggleLock([slideBG.id])
        setIsLocked(!slideBG.isLocked)
      }
    }
  }

  const resetSlide = () => {
    if (editorRef.current) {
      const editor = editorRef.current
      const allShapes = editor.getCurrentPageShapes()
      const shapesToDelete = allShapes.filter(s => !s.id.includes('slide-bg-'))
      editor.deleteShapes(shapesToDelete.map(s => s.id))
      // Update snapshot after reset
      saveCurrentSnapshot()
    }
  }

  const saveBoard = () => {
    if (editorRef.current) {
      const snapshot = getSnapshot(editorRef.current.store)
      const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `slide-${currIdx + 1}.board`
      a.click()
    }
  }

  const loadBoard = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const text = await file.text()
      if (editorRef.current) {
        loadSnapshot(editorRef.current.store, JSON.parse(text))
        saveCurrentSnapshot()
      }
    } catch (err) {
      alert("Failed to load board: " + err.message)
    }
  }

  const saveProject = () => {
    if (!editorRef.current) return

    // Capture the state of the current active slide
    const currentSnapshot = getSnapshot(editorRef.current.store)
    const finalSnapshots = { ...snapshots, [currIdx]: currentSnapshot }

    const projectData = {
      slides,
      snapshots: finalSnapshots,
      currIdx,
      version: '2.0-board',
      timestamp: Date.now()
    }

    try {
      const blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `whiteboard-project-${new Date().toISOString().slice(0, 10)}.board`
      a.click()

      setSnapshots(finalSnapshots)
      console.log("Project saved successfully")
    } catch (err) {
      console.error("Save Error:", err)
      alert("Project is too large to save. Try fewer pages.")
    }
  }

  const loadProject = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    console.log(`Loading project file: ${file.name}, Size: ${file.size} bytes`)

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      console.log("File content parsed successfully")

      if (data.version === '2.0-board' || (data.slides && data.snapshots)) {
        console.log("Format detected: Multi-slide (2.0)")
        console.log(`Slides in file: ${data.slides?.length}, Snapshots: ${Object.keys(data.snapshots || {}).length}`)

        // Reset everything
        setSlides([])
        setSnapshots({})

        // Wait a tick for state to clear before applying new data
        setTimeout(() => {
          setSlides(data.slides || [])
          setSnapshots(data.snapshots || {})
          setCurrIdx(data.currIdx || 0)
          console.log(`State updated: currIdx is now ${data.currIdx || 0}`)
          console.log("Project data application complete")
        }, 100)
      } else {
        console.log("Format detected: Legacy (1.0)")
        if (editorRef.current) {
          loadSnapshot(editorRef.current.store, data)
          saveCurrentSnapshot()
          alert("Legacy board file loaded.")
        }
      }
    } catch (err) {
      console.error("Critical Load Error:", err)
      alert("Failed to load: " + err.message)
    } finally {
      e.target.value = null
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveProject()
      }
      if (e.key === 'ArrowLeft') {
        goToSlide(currIdx - 1)
      } else if (e.key === 'ArrowRight') {
        goToSlide(currIdx + 1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currIdx, slides, snapshots])

  return (
    <div className="app-layout">
      <div className="main-canvas">
        {/* FLOATING ACTION HUB (Bottom Right) */}
        <div className="action-hub">
          <label className="hub-btn upload">
            📂 {loading ? (status || '...') : 'Upload PDF/Images'}
            <input type="file" multiple accept="image/*,application/pdf" onChange={handleFileUpload} style={{ display: 'none' }} disabled={loading} />
          </label>

          <div className="hub-row">
            <button type="button" className="hub-btn" onClick={saveProject}>💾 Save</button>
            <label className="hub-btn">
              📂 Load
              <input type="file" accept=".board" onChange={loadProject} style={{ display: 'none' }} />
            </label>
          </div>

          <div className="hub-row">
            <button type="button" className="hub-btn" onClick={resetSlide} style={{ background: '#ef4444', border: 'none' }}>Reset Page</button>
            <button type="button" className="hub-btn" onClick={exportPNG} style={{ background: '#3b82f6', border: 'none' }}>Export PNG</button>
            <button type="button" className="hub-btn" onClick={() => setDark(!dark)}>{dark ? '☀️' : '🌙'}</button>
          </div>
        </div>

        <div className="canvas-wrapper">
          <Tldraw
            autoFocus
            onMount={(editor) => {
              console.log("Tldraw mounted")
              editorRef.current = editor
              editor.updateInstanceState({ isGridMode: false })
              setIsEditorReady(true)
            }}
            darkMode={dark}
          />
        </div>

        {/* SIDE NAV (Middle Left) */}
        <div className="side-nav">
          <button type="button" className="nav-arrow" onClick={() => goToSlide(currIdx - 1)} disabled={currIdx === 0}>↑</button>
          <div className="nav-info">
            <span className="current-page">{currIdx + 1}</span>
            <span className="total-pages">/ {slides.length}</span>
          </div>
          <button type="button" className="nav-arrow" onClick={() => goToSlide(currIdx + 1)} disabled={currIdx === slides.length - 1}>↓</button>

          <div className="nav-divider" />

          <button type="button" className="add-page-btn" onClick={addNewSlide} title="Add New Page">➕</button>

          <div className="nav-divider" />

          <button type="button" className="lock-toggle" onClick={toggleSlideLock}>
            {isLocked ? '🔒' : '🔓'}
          </button>
        </div>
      </div>

      <style>{`
        .app-layout {
          height: 100vh;
          width: 100vw;
          display: flex;
          background: #0f172a;
          color: white;
          overflow: hidden;
          position: fixed;
          top: 0;
          left: 0;
        }

        .main-canvas {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .canvas-wrapper {
          flex: 1;
          height: 100vh;
          position: relative;
          z-index: 1;
        }

        /* ACTION HUB (Bottom Right) */
        .action-hub {
          position: fixed;
          bottom: 24px;
          right: 24px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          z-index: 11000;
          pointer-events: auto;
        }

        .hub-btn {
          background: #1e293b;
          color: white;
          border: 1px solid rgba(255,255,255,0.1);
          padding: 10px 16px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          transition: all 0.2s;
          white-space: nowrap;
        }

        .hub-btn:hover {
          background: #334155;
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.3);
        }

        .hub-btn.upload {
          background: #10b981;
          border: none;
        }

        .hub-btn.reset {
          background: #ef4444;
          border: none;
        }

        .hub-btn.export {
          background: #3b82f6;
          border: none;
        }

        .hub-row {
          display: flex;
          gap: 8px;
        }

        .hub-row .hub-btn {
          flex: 1;
        }

        /* SIDE NAVIGATION (Middle Left) */
        .side-nav {
          position: fixed;
          left: 24px;
          top: 50%;
          transform: translateY(-50%);
          background: #1e293b;
          padding: 12px;
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          border: 1px solid rgba(255,255,255,0.1);
          z-index: 11001;
        }

        .nav-arrow {
          background: #334155;
          border: none;
          color: white;
          font-size: 18px;
          width: 38px;
          height: 38px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .nav-arrow:hover:not(:disabled) {
          background: #3b82f6;
        }

        .nav-arrow:disabled {
          opacity: 0.15;
          cursor: not-allowed;
        }

        .nav-info {
          display: flex;
          flex-direction: column;
          align-items: center;
          font-family: monospace;
          padding: 4px 0;
        }

        .current-page {
          font-size: 20px;
          font-weight: bold;
          color: white;
        }

        .total-pages {
          font-size: 11px;
          color: #94a3b8;
        }

        .nav-divider {
          width: 24px;
          height: 1px;
          background: rgba(255,255,255,0.1);
        }

        .lock-toggle {
          background: transparent;
          border: none;
          font-size: 18px;
          cursor: pointer;
          padding: 8px;
          border-radius: 12px;
          transition: background 0.2s;
        }

        .lock-toggle:hover {
          background: rgba(255,255,255,0.05);
        }
      `}</style>
    </div>
  )
}
