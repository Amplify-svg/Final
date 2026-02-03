// public/particles.js
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');
let mouse = { x: null, y: null, radius: 120 };

window.addEventListener('mousemove', (e) => { mouse.x = e.x; mouse.y = e.y; });
window.addEventListener('touchmove', (e) => { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; });
window.addEventListener('mouseout', () => { mouse.x = undefined; mouse.y = undefined; });

let lastVibrate = 0;
let userInteracted = false;

// Listen for the first click/tap to "unlock" vibrations
window.addEventListener('click', () => {
    userInteracted = true;
}, { once: true });

function triggerHaptic() {
    if (!navigator.vibrate || !userInteracted) return;

    const now = Date.now();
    if (now - lastVibrate > 50) {
        navigator.vibrate(5);
        lastVibrate = now;
    }
}

let particles = [];
function resize() { 
    canvas.width = window.innerWidth; 
    canvas.height = window.innerHeight; 
}

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.4;
        this.vy = (Math.random() - 0.5) * 0.4;
        this.size = 2;
        this.density = (Math.random() * 30) + 1;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        if (mouse.x != undefined && mouse.y != undefined) {
            let dx = mouse.x - this.x;
            let dy = mouse.y - this.y;
            let dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < mouse.radius) {
                if (dist < mouse.radius - 20) triggerHaptic();
                const force = (mouse.radius - dist) / mouse.radius;
                this.x -= (dx/dist) * force * this.density;
                this.y -= (dy/dist) * force * this.density;
            }
        }
        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
    }
}

function init() { resize(); particles = Array.from({length: 80}, () => new Particle()); }

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Force dark mode colors to match your CSS
    const color = '255, 255, 255'; 
    
    particles.forEach((p, i) => {
        p.update();
        ctx.fillStyle = `rgba(${color}, 0.5)`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
        for (let j = i + 1; j < particles.length; j++) {
            const dx = p.x - particles[j].x, dy = p.y - particles[j].y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 150) {
                ctx.strokeStyle = `rgba(${color}, ${1 - dist/150})`;
                ctx.lineWidth = 0.5;
                ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(particles[j].x, particles[j].y); ctx.stroke();
            }
        }
    });
    requestAnimationFrame(animate);
}
window.addEventListener('resize', init);
init(); animate();