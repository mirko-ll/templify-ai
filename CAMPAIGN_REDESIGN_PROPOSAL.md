# Campaign Cards Redesign Proposal

## Option 1: Compact Horizontal Card (Recommended)

### Key Changes:
- **Horizontal layout** for better space usage
- **Status badge** integrated into header
- **Mini country chips** with click-to-expand metrics
- **Key metrics always visible** (no expansion needed)
- **50% height reduction** (~200px vs 400px+)

### Visual Structure:
```
┌─────────────────────────────────────────────────────────────┐
│ Campaign Name              [Status Badge]    [Manage Button] │
│ Created: 12.01.2025 • Sent: 15.01.2025                      │
│                                                               │
│ HR 🇭🇷 45.2% opens • DE 🇩🇪 38.1% opens • IT 🇮🇹 51.3% opens │
│ Click: 12.5%         Click: 9.8%          Click: 15.2%      │
└─────────────────────────────────────────────────────────────┘
```

---

## Option 2: Table/List View

### Key Changes:
- **Dense table layout** like Gmail/Trello
- **Expandable rows** for details
- **Sortable columns**
- **Bulk actions possible**

### Visual Structure:
```
╔═══════════════════════════════════════════════════════════════╗
║ Name          Status    Countries   Sent         Opens  Clicks ║
╠═══════════════════════════════════════════════════════════════╣
║ Campaign 1    Sent      3 🌍        12.01.25     45%    12%   ║
║ Campaign 2    Scheduled 2 🌍        15.01.25     -      -     ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## Option 3: Compact Grid (2-3 columns)

### Key Changes:
- **2-3 cards per row** on desktop
- **Smaller card footprint**
- **Essential info only**, expand for more
- **Better for visual scanning**

---

## Recommendation: **Option 1 - Compact Horizontal Card**

**Why?**
- Maintains the beautiful card aesthetic you have
- Reduces height by ~50%
- Shows key metrics at a glance
- No need to expand for most use cases
- Mobile friendly (stacks vertically)
- Follows existing design patterns

**Implementation below** ↓
