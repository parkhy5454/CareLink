export default function TabBar({ active, onChange }) {
  return (
    <div className="tabbar">
      <button
        type="button"
        className={`tabbar-btn ${active === 'home' ? 'active' : ''}`}
        onClick={() => onChange('home')}
      >
        <span className="tabbar-icon">⌂</span>
        홈
      </button>
      <button
        type="button"
        className={`tabbar-btn ${active === 'myinfo' ? 'active' : ''}`}
        onClick={() => onChange('myinfo')}
      >
        <span className="tabbar-icon">▤</span>
        내 정보
      </button>
    </div>
  )
}
