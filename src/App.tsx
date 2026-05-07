import './App.css'
import { Header } from './components/layout/Header'
import { LogList } from './components/layout/LogList'
import { Insights } from './components/layout/Insights'

function App() {
    return (
        <div className="App">
            {/* Header */}
            <Header />
            <Insights />
            <LogList />
        </div>
    )
}

export default App
