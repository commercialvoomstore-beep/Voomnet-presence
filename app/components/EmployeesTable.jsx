'use client';

import { memo, useMemo, useState } from 'react';
import { STATUS_LABELS } from '@/lib/rules';
import { initials } from './primitives';

// Liste dynamique des employés VOOMNET — données 100 % réelles.
// Colonnes : SL (auto) · IMAGE (photo réelle ou initiales) · NAME · DEPARTMENT NAME · DATE.
// Photos synchronisées automatiquement via le rafraîchissement du Command Center (5 s).
function EmployeesTable({ employees, onSelect }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .map((emp, idx) => ({ emp, sl: idx + 1 }))
      .filter(({ emp }) => {
        const matchQ =
          !q ||
          emp.matricule.includes(q) ||
          (emp.name || '').toLowerCase().includes(q) ||
          (emp.department || '').toLowerCase().includes(q) ||
          (emp.registeredAt || '').toLowerCase().includes(q);
        const matchS = status === 'all' || emp.today.status === status;
        return matchQ && matchS;
      });
  }, [employees, query, status]);

  return (
    <div>
      <div className="emp-table-tools">
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Rechercher (nom, matricule, département)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rechercher un employé"
        />
        <select
          className="select"
          style={{ maxWidth: 220 }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filtrer par statut"
        >
          <option value="all">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <span className="small muted" style={{ alignSelf: 'center' }}>
          {rows.length} employé{rows.length > 1 ? 's' : ''} · cliquez sur une ligne pour le détail
        </span>
      </div>

      <div className="table-scroll">
        <table className="table table-sticky">
          <thead>
            <tr>
              <th>SL</th>
              <th>Image</th>
              <th>Name</th>
              <th>Department Name</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ emp, sl }) => (
              <tr key={emp.matricule} className="clickable-row" onClick={() => onSelect(emp)}>
                <td>
                  <span className="sl-badge">{sl}</span>
                </td>
                <td>
                  <div className="avatar" style={{ width: 44, height: 44 }}>
                    {emp.photo ? (
                      <img src={emp.photo} alt={`Photo de ${emp.name}`} />
                    ) : (
                      initials(emp.name)
                    )}
                  </div>
                </td>
                <td>
                  <div style={{ fontWeight: 700 }}>{emp.name}</div>
                  <div className="small muted mono">3CX {emp.matricule}</div>
                </td>
                <td>
                  <span className="dept-tag">{emp.department}</span>
                </td>
                <td className="num">{emp.registeredAt}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">
                    <div className="empty-icon" aria-hidden="true">🔍</div>
                    <div className="empty-title">Aucun employé ne correspond</div>
                    <div className="empty-sub">Modifiez la recherche ou le filtre.</div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(EmployeesTable);
