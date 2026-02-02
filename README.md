# CreativeFuel Creators Booking System

A mobile-first web application for managing creator slot bookings. Built with vanilla HTML/CSS/JavaScript and deployed on Vercel.

## 🎯 Features

- **3 Pages**: Login, Slot Booking, and Slot Check
- **Mobile-first Design**: Optimized for mobile devices
- **Auth System**: Hardcoded demo users (no database)
- **Booking Management**:
  - Date selection (Today/Tomorrow/Day After Tomorrow)
  - Time selection with 30-minute increments
  - Cast selection from n8n webhook response
  - Booking details (shoot name, brand, location)
- **Slot Checking**:
  - Mode A: Check availability for specific date/time
  - Mode B: Check multiple creators availability
- **Secure Backend**: Single Vercel serverless function that forwards to n8n
- **No Framework Dependencies**: Vanilla JavaScript only

## 📁 Project Structure

```
cf-slot-app/
├── public/
│   ├── login.html              # Login page
│   ├── booking.html            # Booking page
│   ├── slot-check.html         # Slot check page
│   ├── css/
│   │   └── styles.css          # Mobile-first styles
│   └── js/
│       ├── users.js            # Hardcoded user list
│       ├── creators.js         # Hardcoded creators list
│       ├── auth.js             # Authentication module
│       ├── api.js              # API communication
│       ├── ui.js               # UI utilities
│       ├── login-page.js       # Login page logic
│       ├── booking.js          # Booking page logic
│       └── slot-check.js       # Slot check page logic
├── api/
│   └── n8n.js                  # Vercel serverless function
├── package.json
├── vercel.json
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ (for local development)
- Vercel CLI (for deployment)
- n8n instance with a configured webhook

### Local Development

1. Clone the repository:
```bash
cd cf-slot-app
```

2. Install dependencies:
```bash
npm install
```

3. Install Vercel CLI (if not already installed):
```bash
npm install -g vercel
```

4. Create a `.env.local` file with your environment variables:
```bash
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/booking
APP_KEY=your-optional-app-key
```

5. Run development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Demo Users

Use these credentials to test locally:

| Email | Password | Role |
|-------|----------|------|
| admin@creativefuel.com | admin123 | admin |
| creator@creativefuel.com | creator123 | creator |
| producer@creativefuel.com | producer123 | producer |

## 📦 Deployment on Vercel

### Step 1: Set Up Vercel Project

```bash
vercel
```

Follow the prompts to create a new project.

### Step 2: Configure Environment Variables

In Vercel dashboard (https://vercel.com):

1. Go to Settings → Environment Variables
2. Add the following variables:

```
N8N_WEBHOOK_URL = https://your-n8n-instance.com/webhook/booking
APP_KEY = your-secret-app-key (optional)
```

> **⚠️ Important**: These variables are private and never exposed to the browser. The frontend always calls `/api/n8n`, which securely forwards to your n8n webhook.

### Step 3: Deploy

```bash
vercel --prod
```

Your app is now live on Vercel! 🎉

## 🔌 API Integration with n8n

### Backend Endpoint

The app has one API endpoint: `/api/n8n`

**Request**: POST to `/api/n8n`
```json
{
  "action": "booking_lock",
  "user": {
    "name": "John Doe",
    "role": "creator",
    "email": "creator@creativefuel.com"
  },
  "dateKey": "2026-01-30",
  "fromTime": "14:00",
  "toTime": "15:30"
}
```

### Supported Actions

1. **booking_lock** - Lock a date/time slot
   - Request: `{ action, user, dateKey, fromTime, toTime }`
   - Expected Response: `{ ok: true, cast: [...] }`

2. **booking_submit** - Submit a booking
   - Request: `{ action, user, dateKey, fromTime, toTime, shoot, selected }`
   - Expected Response: `{ ok: true, bookingId, message }`

3. **slotcheck_time** - Check availability for specific time
   - Request: `{ action, user, dateKey, fromTime, toTime }`
   - Expected Response: `{ ok: true, message, ... }`

4. **slotcheck_creators** - Check availability for creators
   - Request: `{ action, user, dateKey, creators: [...] }`
   - Expected Response: `{ ok: true, data, ... }`

### n8n Webhook Setup

To properly integrate with n8n:

1. **Create a Webhook Trigger** in n8n:
   - Method: POST
   - URL: `https://your-n8n-instance.com/webhook/booking`

2. **Respond to Webhook** node:
   - Add this node to send immediate response back to client
   - Map the response object you want to return

3. **Example for booking_lock**:
```javascript
// In n8n "Respond to Webhook" node
{
  "ok": true,
  "cast": [
    { "name": "Sarah Johnson", "type": "lead" },
    { "name": "Marcus Chen", "type": "supporting" }
  ]
}
```

4. **Set Webhook to Respond Immediately**:
   - The webhook should respond quickly (within 30 seconds)
   - Process long operations asynchronously after responding

## 🔐 Security

### Frontend Security
- ✅ Authentication via localStorage (session-based)
- ✅ Auth guard on protected pages (redirects to login)
- ✅ Never exposes n8n URL to browser
- ✅ Never stores secrets in frontend code

### Backend Security
- ✅ Environment variables for sensitive data
- ✅ Single API endpoint for all n8n communication
- ✅ Optional APP_KEY header for additional authentication
- ✅ Proper HTTP error handling

### Best Practices
- Always use HTTPS in production
- Rotate APP_KEY regularly
- Implement rate limiting in n8n for webhooks
- Validate all inputs on both frontend and backend

## 🎨 UI/UX Features

- **Mobile-First**: Optimized for 480px viewport width
- **Responsive Design**: Works on tablets and desktops
- **Accessibility**: Proper labels, ARIA roles, keyboard navigation
- **Loading States**: Visual feedback during API calls
- **Error Handling**: Clear error messages for all operations
- **Toast Notifications**: Success/error/info messages
- **Thumb-Friendly Buttons**: Large tap targets for mobile

## 📱 Hardcoded Data

### Users (public/js/users.js)
Define demo users for login. Structure:
```javascript
{
  email: string,
  password: string,
  name: string,
  role: string ('admin' | 'creator' | 'producer')
}
```

### Creators (public/js/creators.js)
List of creators shown in Slot Check mode B:
```javascript
window.CF_CREATORS = ['Sarah Johnson', 'Marcus Chen', ...]
```

## 🛠️ Customization

### Adding More Users
Edit `public/js/users.js`:
```javascript
window.CF_USERS = [
    {
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User',
        role: 'creator'
    },
    // ...
];
```

### Customizing UI
Edit `public/css/styles.css`:
- Change colors via CSS variables (--color-primary, etc.)
- Adjust spacing with spacing variables
- Modify breakpoints for different screen sizes

### Adding Features
All page logic is in separate JS files:
- `booking.js` - Booking form logic
- `slot-check.js` - Slot check page logic
- `login-page.js` - Login form logic
- `ui.js` - Shared UI utilities

## 📊 Time Format Details

- **Displayed to User**: 12-hour format with am/pm (e.g., "2:30 pm")
- **Sent to API**: 24-hour format (e.g., "14:30")
- **Duration Validation**: Must be 30 minutes to 30 hours
- **Time Increments**: 30 minutes only (00 or 30 minutes)

## ⏰ Date Timezone

- **Timezone**: Asia/Kolkata (IST)
- **Format**: YYYY-MM-DD
- **Options**: Today, Tomorrow, Day After Tomorrow (only 3 dates)

## 🐛 Troubleshooting

### App not loading
- Check browser console for errors
- Verify Vercel deployment is active
- Check environment variables are set in Vercel

### Login not working
- Check demo user credentials in `public/js/users.js`
- Verify localStorage is enabled in browser
- Clear browser cache and try again

### n8n webhook not responding
- Verify N8N_WEBHOOK_URL is correct and accessible
- Check n8n webhook has "Respond to Webhook" node
- Verify webhook is responding within 30 seconds
- Check browser console for network errors

### Time selection issues
- Times must be in 30-minute increments only
- To Time must be after From Time
- Duration must be between 30 minutes and 30 hours

## 📝 Example Workflow

1. **User Login**: Enters email/password → Session stored in localStorage
2. **Booking Page**: 
   - Selects date (Today/Tomorrow/Day After)
   - Selects From & To times (30-min increments)
   - Clicks "Lock Date & Time" → API calls n8n with action="booking_lock"
   - n8n returns list of available cast
   - User fills in booking details (shoot name, brand, etc.)
   - User selects cast members
   - Clicks "Submit Booking" → API calls n8n with action="booking_submit"
   - Success message shown, form reset
3. **Slot Check Page**:
   - Mode A: Check if specific time is available
   - Mode B: Check if specific creators are available on a date

## 🔗 Useful Links

- [Vercel Docs](https://vercel.com/docs)
- [n8n Webhook Docs](https://docs.n8n.io/nodes/n8n-nodes-base.webhook/)
- [MDN Web Docs](https://developer.mozilla.org/)

## 📄 License

MIT - Feel free to use and modify this project.

## 🎯 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review browser console for error messages
3. Verify n8n webhook is configured correctly
4. Check Vercel deployment logs

---

**Built with ❤️ for CreativeFuel**
