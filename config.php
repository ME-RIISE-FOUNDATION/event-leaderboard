<?php
/* =========================================================================
   Admin configuration
   -------------------------------------------------------------------------
   ⚠️  CHANGE THE PASSWORD BELOW before you deploy to Hostinger.
   This is the password you'll type to log into admin.html.
   Use something long and unique — anyone who knows it can edit scores.
   ========================================================================= */

if (!defined('ADMIN_PASSWORD')) {
define('ADMIN_PASSWORD', 'YourStrong#Pass2026');
}

/* Optional: pin allowed origins. Leave empty for same-origin only (default,
   recommended). Only touch this if you serve the frontend from another domain. */
if (!defined('ALLOWED_ORIGIN')) {
  define('ALLOWED_ORIGIN', '');
}
