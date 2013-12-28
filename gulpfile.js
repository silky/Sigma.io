var gulp = require('gulp'),
    concat = require('gulp-concat'),
    jshint = require('gulp-jshint'),
    myth = require('gulp-myth'),
    svgmin = require('gulp-svgmin'),
    uglify = require('gulp-uglify'),
    spawn = require('child_process').spawn,
    nodeProcess,
    nodeServer;

nodeServer = {
  kill : function () {
    if (nodeProcess) {
      nodeProcess.kill();
      console.log('[\033[32mgulp\033[0m] \033[31mServer stopped\033[0m');
    }
  },
  start : function () {
    nodeProcess = spawn('node', ['server.js'], {stdio: 'inherit'});
    console.log('[\033[32mgulp\033[0m] \033[33mServer started\033[0m');
    nodeProcess.on('close', function (code) {
      if (code === 8) {
        console.log('Error detected, waiting for changes...');
      }
    });
  },
  restart : function () {
    this.kill();
    this.start();
  },
  onExitGulp : (function () {
    var _this = this;
    process.on('exit', function() {
      _this.kill;
    });
  }())
};

gulp.task('test', function () {
  gulp.src('./src/js/*.js')
    .pipe(jshint())
    .pipe(jshint.reporter('default'));
});

gulp.task('js', function () {
  gulp.src('./src/js/*.js')
    .pipe(concat('sigma.io.min.js'))
    .pipe(uglify())
    .pipe(gulp.dest('./public/js'));
});

gulp.task('css', function () {
  gulp.src('./src/css/*.css')
    .pipe(myth())
    .pipe(gulp.dest('./public/css'));
});

gulp.task('svg', function() {
  gulp.src('./src/svg/*.svg')
    .pipe(svgmin())
    .pipe(gulp.dest('./public/img'));
});

gulp.task('server', function () {
  nodeServer.restart();
});

gulp.task('default', function () {
  gulp.run('test', 'js', 'css', 'svg', 'server');
  gulp.watch(['./src/js/*.js', './src/css/*.css', './src/svg/*.svg'], function () {
    gulp.run('test', 'js', 'css', 'svg', 'server');
  });
});