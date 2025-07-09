# OpenAI API Integration Setup Guide

## 🤖 Overview

This guide will help you set up OpenAI API integration for AI feedback functionality in your Inner Ops app.

## 📋 Step-by-Step Setup

### 1. **Get Your OpenAI API Key**

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in to your OpenAI account (or create one)
3. Click **"Create new secret key"**
4. Give it a name (e.g., "Inner Ops App")
5. Copy the generated key (it starts with `sk-`)
6. **Important**: Save this key securely - you won't see it again!

### 2. **Add API Key to Environment Variables**

Your `.env` file should now look like this:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=AIzaSyAcHQirVf_hukP6jOHUQnGVCq38QYN0nPU
VITE_FIREBASE_AUTH_DOMAIN=inner-ops-8ce36.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=inner-ops-8ce36
VITE_FIREBASE_STORAGE_BUCKET=inner-ops-8ce36.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=302872007320
VITE_FIREBASE_APP_ID=1:302872007320:web:6e5a3d94841364e98276ed

# OpenAI Configuration
VITE_OPENAI_API_KEY=sk-your_actual_api_key_here

# Development flags
VITE_DEV_MODE=true
```

**Replace `sk-your_actual_api_key_here` with your actual OpenAI API key!**

### 3. **Restart Your Development Server**

After updating the `.env` file:

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

### 4. **Test Your Integration**

1. Navigate to: `http://localhost:5174/openai-test`
2. Check the API Key Status section
3. Try the quick test buttons or enter custom text
4. Verify you get AI responses

## 🧪 **Testing Features**

### **OpenAI Test Page** (`/openai-test`)
- ✅ **API Key validation** - Checks if your key is properly configured
- ✅ **Quick test buttons** - Pre-filled examples for different modules
- ✅ **Custom input testing** - Test with your own content
- ✅ **Real-time feedback** - See actual AI responses
- ✅ **Error debugging** - Clear error messages if something's wrong

### **Integration Points**
Your AI feedback will work in:
- **Journal entries** - Philosophical reflections on your thoughts
- **BlackMirror entries** - Insights about technology use patterns
- **Relapse tracking** - Compassionate guidance during setbacks
- **Kill List items** - Motivation and strategy for eliminating bad habits
- **Compass checks** - Virtue-based guidance for value alignment

## 🔧 **Troubleshooting**

### **"No API key found" Error**
- ✅ Check your `.env` file exists in project root
- ✅ Verify the variable name is exactly `VITE_OPENAI_API_KEY`
- ✅ Restart your development server after changes

### **"Invalid API key" Error (401)**
- ✅ Make sure your API key starts with `sk-`
- ✅ Verify you copied the complete key without extra spaces
- ✅ Check if your OpenAI account has available credits
- ✅ Regenerate a new API key if needed

### **"Too many requests" Error (429)**
- ✅ You've hit OpenAI's rate limits
- ✅ Wait a few minutes before trying again
- ✅ Consider upgrading your OpenAI plan for higher limits

### **Connection/Network Errors**
- ✅ Check your internet connection
- ✅ Verify OpenAI services are up at [status.openai.com](https://status.openai.com)
- ✅ Check if any firewalls are blocking API requests

## 💰 **OpenAI Pricing Notes**

- The app uses **GPT-3.5-turbo** model (cost-effective)
- Typical response: ~100-500 tokens (very low cost)
- Monitor usage at [OpenAI Usage Dashboard](https://platform.openai.com/usage)
- Set usage limits in your OpenAI account for safety

## 🔒 **Security Best Practices**

- ✅ **Never commit `.env` file** to version control
- ✅ **Use environment variables** for all secrets
- ✅ **Set usage limits** in OpenAI dashboard
- ✅ **Regenerate keys** if compromised
- ✅ **Monitor usage** regularly

## 🚀 **Ready to Use!**

Once set up, your AI feedback will provide:
- **Philosophical insights** drawing from ancient and modern wisdom
- **Personalized reflections** based on your specific entries
- **Compassionate guidance** during difficult moments
- **Pattern recognition** to help you grow and improve
- **Practical wisdom** for daily challenges

The AI Oracle is now ready to provide wisdom for your Inner Ops journey! 🔮✨
