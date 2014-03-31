var tessel = require('tessel');

var cameraDriver = require('camera-vc0706');
var bleDriver = require('ble-ble113a');
var async = require('async');

var imgLenChar = 0;
var imgBufChar = 1;

function connectToModules(callback) {
  cameraDriver.use(tessel.port('a'), function(camErr, camera) {
    if (camErr) {
      callback && callback(camErr);
    }
    else {
      bleDriver.use(tessel.port('b'), function(bleErr, bluetooth) {
        callback && callback(bleErr, camera, bluetooth);
      });
    }
  });
}

function bleRoutine(camera, ble, callback) {

  // Start advertising...
  ble.startAdvertising();
  console.log("Started advertising");

  ble.on('connect', function() {
    console.log("Connected!");
  })

  ble.on('disconnect', function(reason) {
    console.log("Disconnected because:", reason, "...  started advertising again...");
    ble.startAdvertising();
  });

  ble.on('remoteNotification', function waitForBufferSub(connection, char) {
    console.log("Remote notification subscribed!", char);

    // If this is for the buffer char 
    if (char === imgBufChar) {

      ble.removeListener('remoteNotification', waitForBufferSub);

      // Take a picture
      console.log("Taking picture");
      camera.setResolution('qqvga', function(err) {
        camera.setCompression(0xFF, function(err) {
          if (err) {
            return callback && callback(err);
          }
          else {
            camera.takePicture(callback);
          }
        });
      });
    }
  });
}

function sendImage(ble, image, callback) {
  console.log("Preparing to send image...", image.length);
  // Make a new buffer for the length
  var lengthBuffer = new Buffer(4);
  // Put length into buffer
  lengthBuffer.writeUInt32BE(image.length, 0);
  // Write it to the characteristic
  ble.writeLocalValue(imgLenChar, lengthBuffer, function(err) {
    if (err) {
      console.log("Error writing local value", err);
    }
    else {
      var bufPos = 0;
      var standardPacketSize = 18;
      var distFromEnd;
      var actualPacketSize;
      var packetSlice;

      console.log("Wrote length", image.length);

      async.whilst(
        function imageCompleteTest() { return (image.length-bufPos) },
        function sendImageSize(callback) {
            console.log("Sending from pos", bufPos);
            // Get the length we have yet to traverse
            distFromEnd = image.length-bufPos;
            // If there are less than 18 bytes left, just send the remainder
            actualPacketSize = (standardPacketSize - distFromEnd > 0) ? distFromEnd : standardPacketSize;
            // Slice the buffer off
            packetSlice = image.slice(bufPos, bufPos + actualPacketSize);
            console.log("sending", packetSlice)
            // Update our position
            bufPos += actualPacketSize;
            // Write the value
            ble.writeLocalValue(imgBufChar, packetSlice, callback);
          },
        callback
      );
    }
  });
}

connectToModules(function(err, camera, ble) {
  if (err) {
    return console.log("Couldn't connect to modules", err);
  }
  else {
    console.log("Connected to modules!")
    bleRoutine(camera, ble, function(err, image) {
      console.log("Picture taken.");
      if (err) {
          return console.log("Error taking picture", err);
        }
        else {
          sendImage(ble, image, function(err) {
            if (!err) {
              console.log("Transfer complete!");
            }
            else {
              console.log("Error sending picture", err);
            }
          });
        }
    });
  }
})


setInterval(function() {}, 20000);