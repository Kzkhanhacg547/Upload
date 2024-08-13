const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const multer = require('multer');
const app = express();

app.use(bodyParser.json());
app.use(express.static('public'));
app.use((req, res, next) => {
    req.setTimeout(600000); // Đặt thời gian chờ là 10 phút
    next();
});
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

const usersFile = 'users.json';

if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify([]));
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const username = req.body.username;
        const userDir = path.join(__dirname, 'uploads', username);

        // Kiểm tra và tạo thư mục nếu không tồn tại
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }

        cb(null, userDir);
    },
    filename: function (req, file, cb) {
        // Sử dụng tên gốc của file
        cb(null, file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 } // Giới hạn kích thước file tối đa 500MB
});

// Các route để hiển thị các trang HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

app.get('/upload', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

// Route để đăng ký người dùng
app.post('/register', (req, res) => {
    const { username, password, email } = req.body;
    const users = JSON.parse(fs.readFileSync(usersFile));

    if (users.find(user => user.username === username)) {
        return res.json({ success: false, message: 'Tên đăng nhập đã tồn tại' });
    }

    if (users.find(user => user.email === email)) {
        return res.json({ success: false, message: 'Email đã được sử dụng' });
    }

    users.push({ username, password, email, files: [], resetToken: null, resetTokenExpiry: null });
    fs.writeFileSync(usersFile, JSON.stringify(users));

    fs.mkdirSync(path.join(__dirname, 'uploads', username), { recursive: true });

    res.json({ success: true });
});

// Route để đăng nhập người dùng
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const users = JSON.parse(fs.readFileSync(usersFile));

    const user = users.find(user => user.username === username && user.password === password);

    if (user) {
        res.json({ success: true, username: user.username });
    } else {
        res.json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }
});

// Route để xử lý quên mật khẩu
app.post('/forgot-password', (req, res) => {
    const { email } = req.body;
    const users = JSON.parse(fs.readFileSync(usersFile));

    const user = users.find(user => user.email === email);

    if (!user) {
        return res.json({ success: false, message: 'Email không tồn tại' });
    }

    const resetToken = Math.random().toString(36).substring(2);
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour

    user.resetToken = resetToken;
    user.resetTokenExpiry = resetTokenExpiry;
    fs.writeFileSync(usersFile, JSON.stringify(users));

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'basilmailtd@gmail.com',
            pass: 'uzxtolejmfoyrzcd'
        }
    });

    const resetLink = `https://zdfmmh-3000.csb.app/reset-password.html?username=${user.username}&token=${resetToken}`;

    const mailOptions = {
        from: 'basilmailtd@gmail.com',
        to: email,
        subject: 'Đặt lại mật khẩu',
        text: `Vui lòng nhấn vào đường link sau để đặt lại mật khẩu: ${resetLink}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return res.json({ success: false, message: 'Gửi email thất bại' });
        }
        res.json({ success: true });
    });
});

// Route để đặt lại mật khẩu
app.post('/reset-password', (req, res) => {
    const { username, token, password } = req.body;
    const users = JSON.parse(fs.readFileSync(usersFile));

    const user = users.find(user => user.username === username && user.resetToken === token && user.resetTokenExpiry > Date.now());

    if (!user) {
        return res.json({ success: false, message: 'Yêu cầu đặt lại mật khẩu không hợp lệ hoặc đã hết hạn' });
    }

    user.password = password;
    user.resetToken = null;
    user.resetTokenExpiry = null;
    fs.writeFileSync(usersFile, JSON.stringify(users));

    res.json({ success: true });
});

// Route để upload file
app.post('/upload', upload.single('file'), (req, res) => {
    const username = req.body.username;
    const users = JSON.parse(fs.readFileSync(usersFile));

    const user = users.find(user => user.username === username);

    if (user) {
        const filePath = path.join('uploads', username, req.file.originalname);
        const modifiedDate = new Date().toISOString();
        user.files.push({ filename: req.file.originalname, filepath: filePath, shared: false, modifiedDate });
        fs.writeFileSync(usersFile, JSON.stringify(users));
        res.json({ success: true, file: filePath });
    } else {
        res.json({ success: false, message: 'Người dùng không tồn tại' });
    }
});

// Route để lấy danh sách tệp của người dùng
app.get('/files', (req, res) => {
    const { username } = req.query;
    const users = JSON.parse(fs.readFileSync(usersFile));

    const user = users.find(user => user.username === username);

    if (user) {
        res.json({ success: true, files: user.files });
    } else {
        res.json({ success: false, message: 'Người dùng không tồn tại' });
    }
});

// Route để xóa tệp
app.post('/delete-file', (req, res) => {
    const { username, filename } = req.body;
    const users = JSON.parse(fs.readFileSync(usersFile));

    const user = users.find(user => user.username === username);

    if (user) {
        const fileIndex = user.files.findIndex(file => file.filename === filename);
        if (fileIndex !== -1) {
            const filePath = path.join(__dirname, 'uploads', username, filename);
            fs.unlinkSync(filePath);
            user.files.splice(fileIndex, 1);
            fs.writeFileSync(usersFile, JSON.stringify(users));
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'Tệp không tồn tại' });
        }
    } else {
        res.json({ success: false, message: 'Người dùng không tồn tại' });
    }
});

// Route để chia sẻ tệp
app.post('/share-file', (req, res) => {
    const { username, filename } = req.body;
    const users = JSON.parse(fs.readFileSync(usersFile));

    const user = users.find(user => user.username === username);

    if (user) {
        const file = user.files.find(file => file.filename === filename);
        if (file) {
            file.shared = !file.shared;
            fs.writeFileSync(usersFile, JSON.stringify(users));
            res.json({ success: true, link: `https://zdfmmh-3000.csb.app/download/${username}/${filename}` });
        } else {
            res.json({ success: false, message: 'Tệp không tồn tại' });
        }
    } else {
        res.json({ success: false, message: 'Người dùng không tồn tại' });
    }
});

// Route tải xuống tệp đã chia sẻ
app.get('/download/:username/:filename', (req, res) => {
    const { username, filename } = req.params;
    const users = JSON.parse(fs.readFileSync(usersFile));

    const user = users.find(user => user.username === username);

    if (user) {
        const file = user.files.find(file => file.filename === filename && file.shared);
        if (file) {
            const filePath = path.join(__dirname, 'uploads', username, filename);
            if (fs.existsSync(filePath)) {
                res.download(filePath);
            } else {
                res.status(404).send('Tệp không tồn tại');
            }
        } else {
            res.status(403).send('Tệp chưa được chia sẻ');
        }
    } else {
        res.status(404).send('Người dùng không tồn tại');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy trên cổng ${PORT}`);
});
