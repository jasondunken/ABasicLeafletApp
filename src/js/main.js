let font;
let mobs = [];
function preload() {
  font = loadFont('res/BELL.TTF');
}

function setup() {
  createCanvas(600, 400);
  background(0);

  var points = font.textToPoints('EPA', 100, 200, 192, {
    sampleFactor: 0.25
  });

  for (let i = 0; i < points.length; i++) {
    noStroke();
    fill('blue');
    ellipse(points[i].x, points[i].y, 2, 2);
    mobs.push(new Vehicle(points[i].x, points[i].y));
  }
}

function draw() {
  background(0);
  fill(128);
  noStroke();
  for (let i = 0; i < mobs.length; i++) {
    let pos = mobs[i].pos;
    let r = mobs[i].r;
    ellipse(pos.x, pos.y, r, r);
    mobs[i].update();
  }

  fill('blue');
  noStroke();
  ellipse(mouse.x, mouse.y, 10, 10);
}

let mouse;

function Vehicle(x, y) {
  this.pos = createVector(random(width), random(height));
  this.trg = createVector(x, y);
  this.vel = p5.Vector.random2D();
  this.acc = createVector();
  this.r = 4;
  this.MAX_SPEED = 5;
  this.MAX_FORCE = 1;

  this.update = function() {
    mouse = createVector(mouseX, mouseY);

    this.acc.add(this.arrive());
    this.acc.add(this.flee(mouse));

    this.pos.add(this.vel);
    this.vel.add(this.acc);
    this.acc.mult(0);
  };

  this.arrive = function() {
    // steering is a vector that is equal to a vector from the target to the current position
    // if you were to add it to the current position, position would equal target
    let steering = p5.Vector.sub(this.trg, this.pos);

    // distance is the distance between target to current position
    let distance = steering.mag();

    let speed = this.MAX_SPEED;
    // lower the speed the closer pos is to target
    if (distance < 1) {
      speed = 0;
    } else if (distance < 100) {
      speed = 1;
    }

    steering.setMag(speed);
    steering = p5.Vector.sub(steering, this.vel);
    return steering.limit(this.MAX_FORCE);
  };

  this.flee = function(mPos) {
    // steering is a vector that is equal to a vector from the target to the current position
    // if you were to add it to the current position, position would equal target
    let steering = p5.Vector.sub(this.trg, mPos);

    // distance is the distance between target to current position
    let distance = steering.mag();

    let speed = this.MAX_SPEED;
    // lower the speed the closer pos is to target
    if (distance < 50) {
      steering.mult(-4);
      steering.setMag(speed);
      steering = p5.Vector.sub(steering, mPos);
      return steering.limit(this.MAX_FORCE);
    } else {
      return createVector();
    }
  };
}
