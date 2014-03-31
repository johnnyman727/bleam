var noble = require('noble');
var moment = require('moment')
var fs = require('fs');

function connectToTessel(callback) {
  noble.startScanning(['08c8c7a06cc511e3981f0800200c9a66']);


  noble.once('discover', function(peripheral) {

    console.log("Found Tessel!");

    peripheral.connect(function(err) {
      if (!err) console.log("Connected!");
      callback && callback(err, peripheral);
    });
  });

  noble.once('disconnect', function() {
    console.log("We have disconnected...");
  })
}

function discoverImageAttributes(tessel, callback) {
  tessel.discoverSomeServicesAndCharacteristics(['d752c5fb13804cd5b0efcac7d72cff20'], ['883f1e6b76f64da187eb6bdbdb617888', '21819AB0C9374188B0DBB9621E1696CD'], function(err, services, chars) {
    if (err) {
      return callback && callback(err);
    }
    else {
      console.log("Discovered!");
      var imgLenChar = services[0].characteristics[0];
      var imgBufferChar = services[0].characteristics[1];

      return callback && callback(null, imgLenChar, imgBufferChar);
    }
  })
}

function subscribeToAttributes(imgLenChar, imgBufferChar, callback) {

  imgLenChar.notify(true, function(err) {
    if (err) {
      callback && callback(err);
    }
    else {
      imgBufferChar.notify(true, function(err) {
        callback && callback(err);
      });
    }
  })
}

var fileName = process.argv[2] || ('image-' + moment().format('MMDYY-hmm') + '.jpeg');

// Find and connect to tessel
connectToTessel(function(err, tessel) {
  // Discover relevant attributes
  discoverImageAttributes(tessel, function(err, imgLenChar, imgBufferChar) {
    // Subscribe to their updates
    subscribeToAttributes(imgLenChar, imgBufferChar, function generateFile(err) {

      var imageLength;
      var bufferPos = 0;

      var file = fs.createWriteStream('./images/' + fileName);

      imgLenChar.on('read', function(data, isNotification) {
        console.log("Got this img length", data.readUInt32BE(0));
        imageLength = data.readUInt32BE(0);
      });


      imgBufferChar.on('read', function(imageSlice, isNotification) {
        // Write to the file
        console.log('reading', imageSlice);
        file.write(imageSlice);
        // Increase our counter
        bufferPos += imageSlice.length;
        console.log("Image is now at size", bufferPos); 

        // If we have copied the whole thing
        if (bufferPos === imageLength) {
          console.log("Transfer complete!");
          console.log("Wrote to file", fileName);
          // Close the file
          file.end();
          // Disconnect
          tessel.disconnect();
        }
      });
    });
  });
})


