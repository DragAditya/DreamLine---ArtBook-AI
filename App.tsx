
import React, { useState, useEffect, useRef } from 'react';
import { generateStoryScenes, generateColoringPage, generateRandomTheme, enhanceTheme, getThemeSuggestions } from './services/geminiService';
import { AppState, BookConfig, GeneratedPage, SavedProject } from './types';
import { ChatWidget } from './components/ChatWidget';
import { Button } from './components/Button';
import { PrintBook } from './components/PrintBook';
import JSZip from 'jszip';

// Removed redundant window.aistudio declaration to fix type conflicts with global AIStudio interface

const ART_STYLES = [
  { id: 'Whimsical', name: 'Whimsical', icon: '✨', desc: 'Classic storybook' },
  { id: 'Disney Animation', name: 'Cartoon', icon: '🐭', desc: 'Expressive & cute' },
  { id: '8-Bit Pixel', name: 'Pixel Art', icon: '👾', desc: 'Retro gaming blocky' },
  { id: 'Mandala', name: 'Pattern', icon: '🌸', desc: 'Complex geometric' },
  { id: 'Anime', name: 'Anime', icon: '👺', desc: 'Japanese animation' },
  { id: 'Lego', name: 'Blocky', icon: '🧱', desc: 'Brick construction' },
];

export default function App() {
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [appState, setAppState] = useState<AppState>(AppState.SETUP);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  
  const [config, setConfig] = useState<BookConfig>({
    childName: '',
    theme: '',
    pageCount: 5,
    aspectRatio: '3:4',
    imageSize: '1K',
    artStyle: 'Whimsical',
    ageGroup: 'kids'
  });

  const [pages, setPages] = useState<GeneratedPage[]>([]);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [historyItems, setHistoryItems] = useState<SavedProject[]>([]);
  const [promptLoading, setPromptLoading] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [suggestedThemes, setSuggestedThemes] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const logContainerRef = useRef<HTMLDivElement>(null);

  // Initialize and check key
  useEffect(() => {
    checkApiKey();

    const savedHistory = localStorage.getItem('dreamlines_history');
    if (savedHistory) {
      try {
        setHistoryItems(JSON.parse(savedHistory));
      } catch (e) { console.error("History parse error", e); }
    }

    const themePref = localStorage.getItem('dreamlines_theme');
    if (themePref === 'light') setIsDarkMode(false);
  }, []);

  const checkApiKey = async () => {
    try {
      const selected = await window.aistudio.hasSelectedApiKey();
      if (selected || process.env.API_KEY) {
        setHasKey(true);
      }
    } catch (e) {
      // If window.aistudio doesn't exist, we might be in a dev env with process.env
      if (process.env.API_KEY) setHasKey(true);
    }
  };

  const handleConnectKey = async () => {
    try {
      await window.aistudio.openSelectKey();
      // Proceed immediately to app state (race condition mitigation)
      setHasKey(true);
    } catch (e) {
      console.error("Key selection failed", e);
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('dreamlines_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    if (hasKey) {
      loadSuggestions();
    }
  }, [hasKey]);

  const loadSuggestions = async () => {
    setSuggestionsLoading(true);
    const key = process.env.API_KEY || '';
    try {
      const suggestions = await getThemeSuggestions(key);
      setSuggestedThemes(suggestions);
    } catch (e) {
      setSuggestedThemes(["Space Dinosaurs", "Underwater Kingdom", "Robot Olympics"]);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setTerminalLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
  };

  const handlePromptButton = async () => {
    const key = process.env.API_KEY || '';
    setPromptLoading(true);
    setValidationError('');
    try {
      if (!config.theme.trim()) {
        const randomTheme = await generateRandomTheme(key);
        setConfig(prev => ({ ...prev, theme: randomTheme }));
      } else {
        const enhanced = await enhanceTheme(config.theme, key);
        setConfig(prev => ({ ...prev, theme: enhanced }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPromptLoading(false);
    }
  };

  const saveProjectToHistory = (newPages: GeneratedPage[], newConfig: BookConfig) => {
    try {
      const project: SavedProject = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        config: newConfig,
        pages: newPages
      };
      const updated = [project, ...historyItems].slice(0, 3); 
      setHistoryItems(updated);
      localStorage.setItem('dreamlines_history', JSON.stringify(updated));
    } catch (e) {
      addLog("Warning: Local storage full. Project not saved to history.");
    }
  };

  const loadProject = (project: SavedProject) => {
    setConfig(project.config);
    setPages(project.pages);
    setAppState(AppState.COMPLETED);
    setShowHistory(false);
  };

  const startGeneration = async () => {
    setValidationError('');
    const key = process.env.API_KEY || '';
    if (!config.childName.trim()) {
      setValidationError("Please enter the child's name.");
      return;
    }

    setAppState(AppState.GENERATING_STORY);
    setTerminalLogs([]);
    addLog("Initializing Dream Engine v3.0 [Gemini Pro]...");
    
    let finalTheme = config.theme;
    if (!finalTheme.trim()) {
      addLog("No theme detected. Engaging creative matrix...");
      try {
        finalTheme = await generateRandomTheme(key);
        addLog(`Theme generated: "${finalTheme}"`);
        setConfig(prev => ({ ...prev, theme: finalTheme }));
      } catch (e) {
        finalTheme = "Magical Forest Adventure";
      }
    }

    addLog(`Config: "${config.childName}" | Style: ${config.artStyle} | Pages: ${config.pageCount}`);
    
    try {
      const sceneDescriptions = await generateStoryScenes(config.childName, finalTheme, config.pageCount, key);
      
      if (sceneDescriptions.length === 0) throw new Error("No scenes generated");

      addLog(`Blueprint acquired. ${sceneDescriptions.length} scenes ready.`);
      
      const initialPages: GeneratedPage[] = sceneDescriptions.map((desc, i) => ({
        id: `page-${i}`,
        sceneDescription: desc,
        status: 'pending'
      }));

      setPages(initialPages);
      setAppState(AppState.GENERATING_IMAGES);
      await generateImagesSequence(initialPages, finalTheme);

    } catch (error: any) {
      if (error.message?.includes("Requested entity was not found")) {
        addLog("API Key invalid or not from paid project. Please re-select.");
        setHasKey(false);
      }
      console.error("Generation failed", error);
      addLog("CRITICAL ERROR: Neural path disconnect.");
      setAppState(AppState.SETUP);
    }
  };

  const generateImagesSequence = async (currentPages: GeneratedPage[], currentTheme: string) => {
    const key = process.env.API_KEY || '';
    const updatedPages = [...currentPages];
    
    for (let i = 0; i < updatedPages.length; i++) {
      updatedPages[i].status = 'generating';
      setPages([...updatedPages]);
      addLog(`Rendering Page ${i + 1}/${updatedPages.length} [High Res 2K]...`);

      const imageUrl = await generateColoringPage(
        updatedPages[i].sceneDescription,
        config.artStyle,
        config.ageGroup,
        config.aspectRatio,
        config.imageSize,
        key
      );

      if (imageUrl) {
        updatedPages[i].imageUrl = imageUrl;
        updatedPages[i].status = 'completed';
        addLog(`Page ${i + 1} rendering complete.`);
      } else {
        updatedPages[i].status = 'failed';
        addLog(`Page ${i + 1} failed.`);
      }
      setPages([...updatedPages]);
    }

    addLog("Compilation complete. Finalizing assets...");
    saveProjectToHistory(updatedPages, { ...config, theme: currentTheme });
    setAppState(AppState.COMPLETED);
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    const folder = zip.folder(`dreamlines-${config.childName.replace(/\s+/g, '-')}`);
    if (folder) {
        folder.file("info.txt", `Title: ${config.theme}\nFor: ${config.childName}\nStyle: ${config.artStyle}`);
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            if (page.imageUrl) {
                const mime = page.imageUrl.split(',')[0].match(/:(.*?);/)?.[1] || 'image/png';
                const ext = mime.split('/')[1];
                const response = await fetch(page.imageUrl);
                const blob = await response.blob();
                folder.file(`page-${i + 1}.${ext}`, blob);
            }
        }
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = `dreamlines-${config.childName}.zip`;
        link.click();
    }
  };

  const handleUniversalShare = async () => {
    const title = `DreamLines: ${config.theme}`;
    const text = `I made a custom coloring book for ${config.childName} with DreamLines AI!`;
    if (navigator.share) {
      try {
        const coverPage = pages.find(p => p.imageUrl && p.status === 'completed');
        if (coverPage && coverPage.imageUrl) {
           const blob = await (await fetch(coverPage.imageUrl)).blob();
           const file = new File([blob], 'coloring-page.png', { type: blob.type });
           if (navigator.canShare && navigator.canShare({ files: [file] })) {
             await navigator.share({ title, text, files: [file] });
             return;
           }
        }
        await navigator.share({ title, text, url: window.location.href });
      } catch (err) { console.warn('Share failed', err); }
    }
  };

  const resetApp = () => {
    setAppState(AppState.SETUP);
    setPages([]);
    setTerminalLogs([]);
  };

  // ---------------- UI RENDER ----------------

  if (!hasKey) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-slate-950">
        <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none"></div>
        <div className="relative glass-panel p-8 md:p-12 rounded-2xl max-w-sm w-full border-t border-indigo-500/20 animate-scale-in text-center">
          <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-cyan-500 rounded-xl mx-auto flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-8 animate-float">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">DreamLines</h1>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">
            Connect your Google AI project to start generating high-quality coloring books.
            <br/><br/>
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-indigo-400 hover:underline">Requires Paid Project</a>
          </p>
          <Button onClick={handleConnectKey} className="w-full">
            Connect Gemini Engine
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col no-print relative transition-colors duration-500">
      <div className="fixed inset-0 bg-grid z-0 opacity-20 pointer-events-none"></div>
      
      <header className="relative z-20 border-b border-[var(--border-color)] bg-[var(--card-bg)] backdrop-blur-xl sticky top-0">
        <div className="container mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={resetApp}>
            <div className="w-7 h-7 bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-lg shadow-lg"></div>
            <h1 className="text-lg font-bold tracking-tight">DreamLines</h1>
          </div>
          <div className="flex items-center gap-3">
             {historyItems.length > 0 && (
                <button onClick={() => setShowHistory(!showHistory)} className="p-2 hover:bg-[var(--border-color)] rounded-full transition-colors active:scale-90">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 opacity-70" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z" />
                   </svg>
                </button>
             )}
             <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 hover:bg-[var(--border-color)] rounded-full transition-colors active:scale-90">
                {isDarkMode ? '☀️' : '🌙'}
             </button>
          </div>
        </div>
      </header>

      {showHistory && (
        <div className="fixed inset-y-0 right-0 w-80 bg-[var(--card-bg)] backdrop-blur-xl border-l border-[var(--border-color)] z-50 p-6 overflow-y-auto animate-slide-up shadow-2xl">
           <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-lg">Your Studio</h3>
              <button onClick={() => setShowHistory(false)} className="text-sm opacity-50 hover:text-red-400">Close</button>
           </div>
           <div className="space-y-4">
              {historyItems.map((item) => (
                 <div key={item.id} onClick={() => loadProject(item)} className="p-4 rounded-xl border border-[var(--border-color)] hover:border-indigo-500 cursor-pointer transition-all hover:bg-[var(--border-color)] group">
                    <div className="font-bold text-sm truncate group-hover:text-indigo-400">{item.config.theme || 'Untitled'}</div>
                    <div className="text-xs opacity-50 mb-2">{item.config.childName} • {new Date(item.timestamp).toLocaleDateString()}</div>
                    <div className="flex gap-1">
                       {item.pages.slice(0,3).map((p, i) => (
                          <div key={i} className="w-8 h-10 bg-[var(--border-color)] rounded-sm overflow-hidden opacity-80">
                             {p.imageUrl && <img src={p.imageUrl} className="w-full h-full object-cover" />}
                          </div>
                       ))}
                    </div>
                 </div>
              ))}
           </div>
        </div>
      )}

      <main className="relative z-10 flex-1 container mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[calc(100vh-140px)]">
        
        {appState === AppState.SETUP && (
          <div className="w-full max-w-xl animate-slide-up">
            <div className="text-center mb-8 relative">
               <h2 className="text-4xl font-black tracking-tight mb-3">Create Magic</h2>
               <p className="text-[var(--text-muted)]">Design a custom coloring book in seconds.</p>
            </div>

            <div className="glass-panel p-8 rounded-3xl border border-[var(--border-color)] shadow-2xl relative overflow-hidden">
                <div className="space-y-6 relative z-10">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 ml-1">Child's Name</label>
                    <input
                      type="text"
                      value={config.childName}
                      onChange={(e) => setConfig({...config, childName: e.target.value})}
                      placeholder="Who is this for?"
                      className="glass-input w-full px-5 py-4 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/50 font-medium text-lg"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 ml-1">Adventure Theme</label>
                    <div className="relative group">
                      <input
                        type="text"
                        value={config.theme}
                        onChange={(e) => setConfig({...config, theme: e.target.value})}
                        placeholder="Leave empty for a surprise..."
                        className="glass-input w-full px-5 py-4 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/50 font-medium text-lg pr-12"
                      />
                      <button onClick={handlePromptButton} disabled={promptLoading} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg text-indigo-400">
                         {promptLoading ? '...' : (config.theme ? '✨' : '🎲')}
                      </button>
                    </div>
                    {validationError && <div className="text-red-400 text-xs mt-2 ml-1">⚠️ {validationError}</div>}
                    <div className="flex flex-wrap gap-2 mt-2 min-h-[28px]">
                       {suggestionsLoading ? <div className="text-xs opacity-50">Loading ideas...</div> : suggestedThemes.map((t, idx) => (
                         <button key={idx} onClick={() => setConfig({...config, theme: t})} className="text-xs px-3 py-1 rounded-full bg-[var(--border-color)] hover:bg-indigo-500 hover:text-white transition-all opacity-70">
                            {t}
                         </button>
                       ))}
                    </div>
                  </div>
                </div>

                <div className="mt-8 relative z-10">
                   <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-3 block">Art Style</label>
                   <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                      {ART_STYLES.map((style) => (
                        <button key={style.id} onClick={() => setConfig({...config, artStyle: style.id})}
                          className={`relative p-2 h-20 rounded-xl flex flex-col items-center justify-center gap-1 transition-all border ${
                            config.artStyle === style.id ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400' : 'bg-black/5 border-transparent'
                          }`}
                        >
                          <span className="text-2xl">{style.icon}</span>
                          <span className="text-[9px] font-bold uppercase">{style.name}</span>
                        </button>
                      ))}
                   </div>
                </div>

                <Button onClick={startGeneration} className="w-full mt-8 py-4 text-lg">Generate Book</Button>
            </div>
          </div>
        )}

        {(appState === AppState.GENERATING_STORY || appState === AppState.GENERATING_IMAGES) && (
          <div className="w-full max-w-4xl animate-slide-up">
             <div className="glass-panel rounded-3xl border border-[var(--border-color)] overflow-hidden shadow-2xl flex flex-col md:flex-row h-[500px]">
                <div className="flex-1 bg-slate-950 p-6 flex flex-col border-r border-[var(--border-color)]">
                   <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-4">
                      <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500/20"></div><div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20"></div><div className="w-2.5 h-2.5 rounded-full bg-green-500/20"></div></div>
                      <span className="ml-auto text-[10px] font-mono text-slate-600 tracking-widest">GEMINI_PRO_ACTIVE</span>
                   </div>
                   <div className="flex-1 overflow-y-auto space-y-3 font-mono text-xs md:text-sm" ref={logContainerRef}>
                      {terminalLogs.map((log, i) => <div key={i} className="text-slate-400"><span className="text-indigo-500 mr-2">➜</span>{log}</div>)}
                      <div className="animate-pulse text-indigo-400">_</div>
                   </div>
                </div>
                <div className="w-full md:w-80 bg-[var(--card-bg)] p-8 flex flex-col items-center justify-center">
                   <div className="text-center space-y-8">
                      <div className="w-32 h-32 relative mx-auto"><div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full animate-spin"></div><div className="absolute inset-0 flex items-center justify-center text-4xl">🎨</div></div>
                      <div>
                         <div className="text-4xl font-bold font-mono">
                           {Math.round((pages.filter(p => p.status === 'completed').length / config.pageCount) * 100)}%
                         </div>
                         <div className="text-[10px] uppercase tracking-widest opacity-50 mt-2">Processing Magic</div>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        )}

        {appState === AppState.COMPLETED && (
          <div className="w-full max-w-6xl space-y-8 animate-slide-up pb-12">
            <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6 sticky top-20 z-10 shadow-xl border-indigo-500/20">
               <div className="text-center md:text-left">
                  <h2 className="text-2xl font-bold font-comic text-gradient">{config.theme}</h2>
                  <p className="text-sm opacity-60">Created for {config.childName}</p>
               </div>
               <div className="flex flex-wrap justify-center gap-3">
                  <Button onClick={handleUniversalShare} variant="primary" className="text-sm">Share</Button>
                  <Button onClick={downloadZip} variant="ghost" className="text-sm">ZIP</Button>
                  <Button onClick={() => window.print()} variant="ghost" className="text-sm">PDF / Print</Button>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 px-2">
              <div className="aspect-[3/4] glass-panel rounded-xl flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-[var(--border-color)]">
                 <h3 className="font-comic text-2xl font-bold mb-2">{config.theme}</h3>
                 <p className="text-xs uppercase tracking-widest opacity-50">Cover Page</p>
              </div>
              {pages.map((page, idx) => (
                <div key={page.id} className="group relative aspect-[3/4] bg-white rounded-xl overflow-hidden shadow-md hover:scale-[1.02] transition-all">
                  {page.imageUrl ? <img src={page.imageUrl} className="w-full h-full object-contain" /> : <div className="flex items-center justify-center h-full text-red-400 text-xs">Error</div>}
                  <div className="absolute bottom-0 inset-x-0 bg-white/90 p-4 translate-y-full group-hover:translate-y-0 transition-transform">
                     <p className="text-xs text-black font-medium">{page.sceneDescription}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center pt-12">
               <Button onClick={resetApp} variant="outline">Create Another Book</Button>
            </div>
          </div>
        )}
      </main>

      <footer className="w-full py-8 text-center text-[var(--text-muted)] text-sm border-t border-[var(--border-color)]">
        <p className="font-medium">Powered by Gemini 3 Pro Engine</p>
      </footer>

      {hasKey && <ChatWidget apiKey={process.env.API_KEY || ''} />}
      {appState === AppState.COMPLETED && <PrintBook pages={pages} config={config} />}
    </div>
  );
}
