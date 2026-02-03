# Store Health AI - Dashboard

Modern React dashboard for monitoring retail store health in real-time.

## Features

- **Dashboard Overview** - Real-time store health summary with charts
- **Store Detail View** - Individual store KPIs, alerts, tasks, and call history
- **Alert Management** - Acknowledge and resolve alerts
- **Task Management** - Track and complete store tasks
- **Real-time Updates** - WebSocket integration for live notifications
- **Responsive Design** - Works on desktop, tablet, and mobile

## Tech Stack

- **React 18** - Modern React with hooks
- **Vite** - Lightning-fast build tool
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Beautiful, accessible components
- **React Router** - Client-side routing
- **TanStack Query** - Data fetching and caching
- **Recharts** - Data visualization
- **Socket.IO** - Real-time WebSocket connection
- **Lucide Icons** - Beautiful icon library

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Store Health AI API running on port 3000

## Installation

1. **Install dependencies:**
```bash
cd dashboard
npm install
```

2. **Create environment file:**
```bash
cp .env.example .env
```

3. **Configure environment variables:**
```bash
# .env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=http://localhost:3000
```

## Development

Start the development server:
```bash
npm run dev
```

The dashboard will be available at `http://localhost:5173`

## Build for Production

Build the optimized production bundle:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Project Structure

```
dashboard/
├── src/
│   ├── components/       # Reusable UI components
│   │   ├── ui/          # Base UI components (Card, Button, Badge)
│   │   ├── Layout.jsx   # Main layout with sidebar
│   │   ├── StatusBadge.jsx
│   │   ├── StoreHealthCard.jsx
│   │   ├── Loading.jsx
│   │   └── ErrorMessage.jsx
│   ├── pages/           # Page components
│   │   ├── DashboardPage.jsx
│   │   ├── StoreDetailPage.jsx
│   │   ├── AlertsPage.jsx
│   │   └── TasksPage.jsx
│   ├── lib/             # Utilities and API
│   │   ├── api.js       # API client
│   │   ├── websocket.js # WebSocket hooks
│   │   └── utils.js     # Helper functions
│   ├── App.jsx          # Root component with routing
│   ├── main.jsx         # App entry point
│   └── index.css        # Global styles
├── public/              # Static assets
├── index.html          # HTML template
├── package.json        # Dependencies
├── vite.config.js      # Vite configuration
└── tailwind.config.js  # Tailwind configuration
```

## Key Components

### Dashboard Overview
- Summary statistics (total stores, health scores)
- Critical stores grid
- KPI trends chart
- Top issues across stores

### Store Detail View
- Real-time health score
- Current KPIs with variance indicators
- Health history chart (30 days)
- Active alerts and pending tasks
- AI call history

### Alert Management
- Filter alerts by status and severity
- Acknowledge and resolve alerts
- Real-time alert updates

### Task Management
- Filter tasks by status and priority
- Mark tasks as in progress or completed
- Overdue task indicators

## Real-time Features

The dashboard uses WebSocket connections for real-time updates:

- **alert:new** - New alert created
- **alert:acknowledged** - Alert acknowledged
- **kpi:updated** - KPI metric updated
- **escalation:new** - New escalation created
- **call:completed** - AI call completed

Data refreshes automatically when these events occur.

## API Integration

The dashboard connects to the Store Health AI API with the following endpoints:

- `GET /api/v1/dashboard/overview` - Dashboard statistics
- `GET /api/v1/stores` - List all stores
- `GET /api/v1/stores/:id` - Store details
- `GET /api/v1/stores/:id/health` - Store health data
- `GET /api/v1/alerts` - List alerts
- `POST /api/v1/alerts/:id/acknowledge` - Acknowledge alert
- `GET /api/v1/tasks` - List tasks
- `POST /api/v1/tasks/:id/complete` - Complete task

See [API_DOCUMENTATION.md](../API_DOCUMENTATION.md) for complete API reference.

## Customization

### Colors

Edit color variables in `src/index.css`:

```css
:root {
  --primary: 221.2 83.2% 53.3%;
  --success: 142 76% 36%;
  --warning: 38 92% 50%;
  --danger: 0 84% 60%;
}
```

### Components

All UI components support className prop for custom styling:

```jsx
<Card className="custom-class">
  <CardContent>...</CardContent>
</Card>
```

## Deployment

### Option 1: Static Hosting (Vercel, Netlify)

1. Build the project:
```bash
npm run build
```

2. Deploy the `dist` folder to your hosting provider

3. Configure environment variables in your hosting dashboard

### Option 2: Docker

```dockerfile
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Option 3: Serve with Express

Serve the built files from your API server:

```javascript
// In your Express app
app.use(express.static('dashboard/dist'));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/dist/index.html'));
});
```

## Browser Support

- Chrome (last 2 versions)
- Firefox (last 2 versions)
- Safari (last 2 versions)
- Edge (last 2 versions)

## Troubleshooting

### API Connection Issues

If the dashboard can't connect to the API:

1. Verify the API is running on port 3000
2. Check `VITE_API_URL` in `.env`
3. Ensure CORS is enabled on the API

### WebSocket Not Connecting

1. Verify `VITE_WS_URL` matches your API URL
2. Check that the API has Socket.IO configured
3. Look for WebSocket errors in browser console

### Build Errors

Clear node_modules and reinstall:
```bash
rm -rf node_modules package-lock.json
npm install
```

## License

MIT

## Support

For issues and questions, see the main [Store Health AI documentation](../README.md).
