/**
 * Authentication Helper for RinglyPro CRM
 * Handles JWT token management, validation, and automatic refresh
 *
 * Usage:
 * <script src="/js/auth.js"></script>
 *
 * Then in your page:
 * Auth.requireAuth(); // Redirects to login if not authenticated
 * Auth.getToken(); // Get current JWT token
 * Auth.makeAuthenticatedRequest('/api/endpoint'); // Make API call with auth
 */

(function(window) {
    'use strict';

    const Auth = {
        /**
         * Configuration
         */
        config: {
            tokenKey: 'token',
            userKey: 'user',
            loginUrl: '/login',
            dashboardUrl: '/',
            apiBaseUrl: '',
            tokenRefreshInterval: 6 * 24 * 60 * 60 * 1000, // 6 days (before 7-day expiration)
            sessionTimeoutWarning: 30 * 60 * 1000, // 30 minutes warning
            sessionTimeout: 60 * 60 * 1000 // 1 hour timeout
        },

        /**
         * Internal state
         */
        _refreshTimer: null,
        _activityTimer: null,
        _sessionWarningShown: false,

        /**
         * Initialize authentication system
         */
        init() {
            this.setupActivityTracking();
            this.setupTokenRefresh();
        },

        /**
         * Get stored JWT token
         */
        getToken() {
            return localStorage.getItem(this.config.tokenKey);
        },

        /**
         * Set JWT token
         */
        setToken(token) {
            localStorage.setItem(this.config.tokenKey, token);
            this._sessionWarningShown = false;
            this.resetActivityTimer();
        },

        /**
         * Get stored user data
         */
        getUser() {
            const userJson = localStorage.getItem(this.config.userKey);
            return userJson ? JSON.parse(userJson) : null;
        },

        /**
         * Set user data
         */
        setUser(user) {
            localStorage.setItem(this.config.userKey, JSON.stringify(user));
        },

        /**
         * Check if user is authenticated
         */
        isAuthenticated() {
            return !!this.getToken();
        },

        /**
         * Require authentication - redirect to login if not authenticated
         */
        requireAuth() {
            if (!this.isAuthenticated()) {
                this.redirectToLogin();
                return false;
            }
            return true;
        },

        /**
         * Verify token with server
         */
        async verifyToken() {
            const token = this.getToken();
            if (!token) {
                return false;
            }

            try {
                const response = await fetch('/api/auth/verify', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    return data.valid === true;
                }

                return false;
            } catch (error) {
                console.error('Token verification failed:', error);
                return false;
            }
        },

        /**
         * Logout user
         */
        async logout() {
            const token = this.getToken();

            // Call logout endpoint
            if (token) {
                try {
                    await fetch('/api/auth/logout', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                } catch (error) {
                    console.error('Logout API call failed:', error);
                }
            }

            // Clear local storage
            localStorage.removeItem(this.config.tokenKey);
            localStorage.removeItem(this.config.userKey);

            // Clear timers
            if (this._refreshTimer) {
                clearInterval(this._refreshTimer);
            }
            if (this._activityTimer) {
                clearTimeout(this._activityTimer);
            }

            // Redirect to login
            this.redirectToLogin();
        },

        /**
         * Redirect to login page
         */
        redirectToLogin() {
            window.location.href = this.config.loginUrl;
        },

        /**
         * Redirect to dashboard
         */
        redirectToDashboard() {
            window.location.href = this.config.dashboardUrl;
        },

        /**
         * Make authenticated API request
         */
        async makeAuthenticatedRequest(url, options = {}) {
            const token = this.getToken();

            if (!token) {
                throw new Error('No authentication token available');
            }

            // Merge headers
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...(options.headers || {})
            };

            // Make request
            const response = await fetch(url, {
                ...options,
                headers
            });

            // Handle 401 Unauthorized
            if (response.status === 401) {
                console.warn('Authentication failed - token may be expired');
                this.logout();
                throw new Error('Authentication failed');
            }

            return response;
        },

        /**
         * Refresh authentication token
         */
        async refreshToken() {
            const token = this.getToken();

            if (!token) {
                console.warn('No token to refresh');
                return false;
            }

            try {
                console.log('🔄 Refreshing authentication token...');

                const response = await fetch('/api/auth/refresh-token', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();

                    if (data.success && data.token) {
                        this.setToken(data.token);
                        console.log('✅ Token refreshed successfully');
                        return true;
                    }
                }

                console.error('❌ Token refresh failed');
                return false;
            } catch (error) {
                console.error('Token refresh error:', error);
                return false;
            }
        },

        /**
         * Setup automatic token refresh
         */
        setupTokenRefresh() {
            if (this._refreshTimer) {
                clearInterval(this._refreshTimer);
            }

            // Refresh token every 6 days (before 7-day expiration)
            this._refreshTimer = setInterval(() => {
                this.refreshToken();
            }, this.config.tokenRefreshInterval);

            console.log('🔄 Automatic token refresh enabled');
        },

        /**
         * Setup activity tracking for session timeout
         */
        setupActivityTracking() {
            const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

            const activityHandler = () => {
                this.resetActivityTimer();
            };

            // Add event listeners
            events.forEach(event => {
                document.addEventListener(event, activityHandler, true);
            });

            // Start initial timer
            this.resetActivityTimer();

            console.log('👁️ Activity tracking enabled');
        },

        /**
         * Reset activity timer
         */
        resetActivityTimer() {
            if (!this.isAuthenticated()) {
                return;
            }

            // Clear existing timer
            if (this._activityTimer) {
                clearTimeout(this._activityTimer);
            }

            // Reset warning flag
            this._sessionWarningShown = false;

            // Set new timer for session timeout
            this._activityTimer = setTimeout(() => {
                this.handleSessionTimeout();
            }, this.config.sessionTimeout);
        },

        /**
         * Handle session timeout
         */
        handleSessionTimeout() {
            console.warn('⏰ Session timeout due to inactivity');

            if (confirm('Your session has expired due to inactivity. Would you like to stay logged in?')) {
                // Refresh token to extend session
                this.refreshToken().then(success => {
                    if (success) {
                        this.resetActivityTimer();
                    } else {
                        this.logout();
                    }
                });
            } else {
                this.logout();
            }
        },

        /**
         * Get user profile from API
         */
        async getProfile() {
            try {
                const response = await this.makeAuthenticatedRequest('/api/auth/profile');

                if (response.ok) {
                    const data = await response.json();

                    if (data.success && data.data.user) {
                        this.setUser(data.data.user);
                        return data.data;
                    }
                }

                return null;
            } catch (error) {
                console.error('Failed to get profile:', error);
                return null;
            }
        },

        /**
         * Update user profile
         */
        async updateProfile(updates) {
            try {
                const response = await this.makeAuthenticatedRequest('/api/auth/update-profile', {
                    method: 'POST',
                    body: JSON.stringify(updates)
                });

                if (response.ok) {
                    const data = await response.json();

                    if (data.success && data.data.user) {
                        this.setUser(data.data.user);
                        return data.data.user;
                    }
                }

                return null;
            } catch (error) {
                console.error('Failed to update profile:', error);
                throw error;
            }
        },

        /**
         * Parse JWT token to get payload
         */
        parseToken(token) {
            try {
                token = token || this.getToken();
                if (!token) return null;

                const base64Url = token.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join(''));

                return JSON.parse(jsonPayload);
            } catch (error) {
                console.error('Failed to parse token:', error);
                return null;
            }
        },

        /**
         * Check if token is expired
         */
        isTokenExpired(token) {
            const payload = this.parseToken(token);
            if (!payload || !payload.exp) {
                return true;
            }

            return Date.now() >= payload.exp * 1000;
        },

        /**
         * Get token expiration time
         */
        getTokenExpiration(token) {
            const payload = this.parseToken(token);
            if (!payload || !payload.exp) {
                return null;
            }

            return new Date(payload.exp * 1000);
        },

        /**
         * Format time until token expiration
         */
        getTimeUntilExpiration(token) {
            const expiration = this.getTokenExpiration(token);
            if (!expiration) {
                return null;
            }

            const now = Date.now();
            const expirationTime = expiration.getTime();
            const diff = expirationTime - now;

            if (diff <= 0) {
                return 'Expired';
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

            if (days > 0) {
                return `${days} day${days > 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''}`;
            }

            return `${hours} hour${hours !== 1 ? 's' : ''}`;
        }
    };

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (Auth.isAuthenticated()) {
                Auth.init();
            }
        });
    } else {
        if (Auth.isAuthenticated()) {
            Auth.init();
        }
    }

    // Export to window
    window.Auth = Auth;

})(window);
