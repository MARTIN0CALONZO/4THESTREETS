export default function ChartCard({ title, heights = [28, 62, 45, 78, 52] }) {
  return (
    <section className="panel chart-card">
      <h3>{title}</h3>
      <div className="mini-chart">
        <div className="y-axis"><span>100</span><span>50</span><span>0</span></div>
        <div className="bars">
          {heights.map((h, i) => (
            <div className="bar-wrap" key={i}>
              <div className={`bar bar-${i}`} style={{ height: `${h}%` }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}