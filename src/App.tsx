import './App.css'
import { Header } from './components/layout/Header'
import { LogList } from './components/layout/LogList'

function App() {
    return (
        <div className="App">
            {/* Header */}
            <Header />            
            <LogList />
        </div>
    )
}

export default App
