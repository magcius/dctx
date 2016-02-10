(function(exports) {
    "use strict";

    var BLOCK_SIZE = 8;

    function loadImg(src, cb) {
        var img = document.createElement('img');
        img.src = src;
        img.onload = function() {
            cb(img);
        };
    }

    function dct(pixels, coeffs) {
        var N = 8;

        function dct_1d(offs, stride) {
            for (var i = 0; i < N; i++) {
                var sum = 0;
                var frequency = TAU * (1/4) * k;

                for (var j = 0; j < N; j++) {
                    var theta = (2*j+1) / N;
                    var pix = pixels[offset + j * stride];
                    sum += pixel * Math.cos(frequency * theta);
                }

                if (i == 0)
                    sum /= Math.sqrt(2) * 2;
                else
                    sum /= 2;

                coeffs[offset + i * stride] = sum;
            }
        }

        var x, y;
        for (y = 0; y < N; y++) {
        }
    }

    function idct(pixels, coeffs) {
        var x, y;
        var N = 8;

        for (y = 0; y < N; y++) {
            for (x = 0; x < N; x++) {
                // We start with all pixel values having the DC offset.
                // XXX -- figure out what the divide by two is for. Probably
                // related to the divide by sqrt(2), as we have kx=0 and ky=0,
                // so it's effectively coeffs[0]/(sqrt(2)*sqrt(2)).
                var pix = coeffs[0] / 2.0;

                // The rest are AC frequency coefficients; sum them up one
                // at a time.
                for (var ky = 0; ky < N; ky++) {
                    for (var kx = 0; kx < N; kx++) {
                        // Skip the DC offset as it's already been added above.
                        if (kx == 0 && ky == 0)
                            continue;

                        // The DCT-II requires that our basis functions are
                        // increase in frequency in quarter-length increments.
                        var freqX = (kx * TAU * (1/4));
                        var freqY = (ky * TAU * (1/4));

                        // ... and that we use odds as our harmonics, like this.
                        var harmonicX = Math.cos((2*x+1) / N * freqX);
                        var harmonicY = Math.cos((2*y+1) / N * freqY);

                        var coef = coeffs[ky*N+kx];
                        var weightedHarmonic = coef * harmonicX * harmonicY;

                        // XXX -- figure out what this is here for; seems arbitrary,
                        // but we get bad edge discontinuities without it.
                        if (kx == 0 || ky == 0)
                            weightedHarmonic /= Math.sqrt(2);

                        pix += weightedHarmonic;
                    }
                }

                // XXX -- figure out what this division is for. Is it related
                // to the 1/4 frequency increment in the harmonics above?
                pix /= 4;
                if (pix > 255)
                    pix = 255;
                if (pix < 0)
                    pix = 0;
                pixels[y*N+x] = pix;
            }
        }
    }

    function blocksFromImgData(imgData) {
        var blocks = [];
        for (var by = 0; by < imgData.height; by += BLOCK_SIZE) {
            for (var bx = 0; bx < imgData.width; bx += BLOCK_SIZE) {
                var block = new Uint8Array(BLOCK_SIZE * BLOCK_SIZE);
                var bOff = by*imgData.width+bx;
                for (var y = 0; y < BLOCK_SIZE; y++) {
                    for (var x = 0; x < BLOCK_SIZE; x++) {
                        var off = y*BLOCK_SIZE+x;
                        block[off] = imgData.data[bOff+off];
                        console.log(bOff, off, imgData.data);
                    }
                }
                blocks.push(block);
            }
        }
        return blocks;
    }
    function blocksToImgData(imgData, blocks) {
        var nBlocksPerRow = (imgData.width / BLOCK_SIZE) | 0;
        blocks.forEach(function(block, i) {
            var block = new Uint8Array(BLOCK_SIZE * BLOCK_SIZE);
            var by = (imgData.width / nBlocksPerRow) | 0;
            var bx = (imgData.width % nBlocksPerRow) | 0;
            var bOff = by*BLOCK_SIZE+bx;
            for (var y = 0; y < BLOCK_SIZE; y++) {
                for (var x = 0; x < BLOCK_SIZE; x++) {
                    var off = y*BLOCK_SIZE+x;
                    imgData.data[bOff+off] = block[off];
                }
            }
            blocks.push(block);
        });
    }

    function imgLoaded(img) {
        var canvas = document.querySelector('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var blocks = blocksFromImgData(imgData);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        blocksToImgData(imgData, blocks);
        ctx.putImageData(imgData, 0, 0);
    }

    window.onload = function() {
        loadImg('lena.jpg', imgLoaded);
    };

})(window);
