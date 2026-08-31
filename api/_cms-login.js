// ============================================================================
// FOURLAND CMS LOGIN & LOGOUT API HANDLER
// ============================================================================

const DEMO_USERS = {
  'admin@fourland.vn': { id: 'usr-admin-01', displayName: 'Lê Fourland (Super Admin)', role: 'super_admin', email: 'admin@fourland.vn' },
  'manager@fourland.vn': { id: 'usr-mgr-02', displayName: 'Trần Quản Lý (Manager)', role: 'manager', email: 'manager@fourland.vn' },
  'sales@fourland.vn': { id: 'usr-sales-03', displayName: 'Nguyễn Bất Động Sản (Sales)', role: 'sales', email: 'sales@fourland.vn' },
  'editor@fourland.vn': { id: 'usr-edit-04', displayName: 'Phạm Biên Tập (Editor)', role: 'editor', email: 'editor@fourland.vn' },
  'viewer@fourland.vn': { id: 'usr-view-05', displayName: 'Khách Xem Kho (Viewer)', role: 'viewer', email: 'viewer@fourland.vn' }
};

function createHandler() {
  return async function handler(req, res) {
    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action || (req.url?.includes('logout') ? 'logout' : 'login');

      if (action === 'logout') {
        res.setHeader('Set-Cookie', 'fourland_cms_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
        return res.status(200).json({ ok: true, message: 'Đã đăng xuất thành công' });
      }

      // Login action
      const email = String(body.email || body.username || '').toLowerCase().trim();
      const password = String(body.password || '').trim();
      const selectedRole = body.role;

      let user = null;

      if (selectedRole && ['super_admin', 'manager', 'editor', 'sales', 'viewer'].includes(selectedRole)) {
        const matchingKey = Object.keys(DEMO_USERS).find(k => DEMO_USERS[k].role === selectedRole);
        user = matchingKey ? DEMO_USERS[matchingKey] : { id: `usr-${selectedRole}`, displayName: `Tài khoản ${selectedRole}`, role: selectedRole };
      } else if (DEMO_USERS[email]) {
        user = DEMO_USERS[email];
      } else if (email) {
        user = {
          id: `usr-${Date.now().toString(36)}`,
          displayName: email.split('@')[0].toUpperCase(),
          role: 'sales',
          email
        };
      }

      if (!user) {
        return res.status(401).json({
          ok: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Tài khoản hoặc mật khẩu không chính xác' }
        });
      }

      const token = 'fourland-preview-cms';
      return res.status(200).json({
        ok: true,
        data: {
          user,
          token,
          expiresIn: 86400
        },
        message: `Đăng nhập thành công với vai trò ${user.role}`
      });
    }

    return res.status(405).json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' } });
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.DEMO_USERS = DEMO_USERS;
