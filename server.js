var express = require("express"); 
var app = express();
var bodyParser = require("body-parser");
var path = require("path")
var uuid = require('uuid-random');

const { uniqueNamesGenerator, adjectives, colors, animals, names } = require('unique-names-generator');

// Running our server on port 8080
var PORT  = process.env.PORT || 8080

var server = app.listen(PORT, function() {
  var host = server.address().address;
  var port = server.address().port;
  console.log('Listening at http://%s:%s', 'localhost/', port);
});

//app.get('*', (req, res) => res.sendFile(path.resolve('build', 'index.html')));

var io = require('socket.io')(server);

app.use(express.static(path.join(__dirname,"/build")));// Invoking our middleware
app.use(bodyParser.json());

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

var roomsData = {

}

var playersData = {

}

var hostPassword = "1234"

var currentQuestionNum = 0

io.on('connection', (client) => {

  console.log("New client connected");

  // console.log(client)

  //Create Player ID
  client.on("CreatePlayerID", (data) => {
    createPlayerID(client)
  })

  //Notify Player Connected with
  client.on("PlayerConnected", (playerData) => {
    console.log("Socket ID is " + client.id)
    playersData["" + client.id] = {playerID: playerData.playerID, username: playerData.username}
    console.log("Current Players Data...")
    console.log(playersData)
  })

  

  //DisconnectPlayer (NOT USED CURRENTLY)
  client.on("DisconnectPlayer", (playerData) => {
    console.log("Player Data: " + playerData)
  })

  //Create Room with ID (for Game Host)
  client.on("CreateRoomWithID", (hostRoomData) => {

    if(hostRoomData.password == hostPassword){

      console.log("Creating Room...")
      console.log(hostRoomData)
      let roomID = generateRandomInterger(1000,10000)
      console.log("New Room ID: " + roomID)
      client.join("" + roomID)

      console.log(client.rooms)

      playersData["" + client.id].hostname = hostRoomData.username
      // playersData["" + client.id].nickname = "Trivia Room"

      // playersData["" + client.id].isAlive = true;

      //Set Server player data to have room
      assignRoomToPlayer(client.id, roomID)

      successfullyCreatedRoom(client, roomID, "Trivia Room", hostRoomData.username)
    } else {
      failedCreateRoom(client)
    }
  })

  //Send Trivia Questions to Client
  client.on("GetQuestions", () => {
    sendQuestionsToPlayer(client)
  })

  //Send Trivia Questions to All Players
  client.on("SendCurrentQuestion", (currentQuestionNumber) => {
    console.log("Send Current Question")
    console.log(currentQuestionNumber)
    currentQuestionNum = currentQuestionNumber
    sendQuestionNumberToAllPlayers(client)
  })

  client.on("GetGameRoomInfo", (roomID) => {
    console.log("Getting Room Info...")
    sendRoomInfoToPlayer(roomID, client)
  })

  client.on("CheckIfRoomIDIsValid", (roomID) => {
    verifyRoomID(client, roomID)
  })

  client.on("GetRoomStatus", (roomID) => {
    verifyRoomStatus(client, roomID)
  })

  client.on("SendGameStatusToAllPlayers", (statusData) => {
    console.log("Sending Game Status To All Players...")
    console.log(statusData)
    console.log(roomsData[statusData.roomID])
    sendGameStatusToAllPlayers(client, statusData)
  })

  client.on("ShowAnswerToPlayers", (roomID) => {
    console.log("Sending Show Answer To Players...")
    showAnswerToPlayers(client, roomID)
  })

  //Create Room with ID (for Game Host)
  client.on("GetPlayersInRoom", (roomID) => {
    updatePlayersInRoom(client, roomID)
    getPlayersInRoom(client, roomID)
  })

  //Create Room with ID (for Game Host)
  client.on("JoinRoomWithID", (joinRoomData) => {
    console.log("Joining Room with ID... " +  joinRoomData.roomID)

    //If Room Exists...
    if(roomsData["" + joinRoomData.roomID]) {

      //TODO: Add logic to confirm that player joined room
      roomsData[joinRoomData.roomID]["players"].push(joinRoomData.username)

      console.log(roomsData[joinRoomData.roomID])

      client.join("" + joinRoomData.roomID)

      playersData["" + client.id].username = joinRoomData.username

      // playersData["" + client.id].isAlive = true;

      //Set Server player data to have room
      assignRoomToPlayer(client.id, joinRoomData.roomID)

      console.log(client.rooms)
      updatePlayersInRoom(client, joinRoomData.roomID)
      successfulyJoinedRoom(client, joinRoomData.roomID)
    } 
    else {
      failedJoiningRoom(client)
    }
  })

  //Player (Host) Started Game
  client.on('StartGame', () => {
    //Send Message to all other players that game started
    gameStarted(client)
  });

  //Player Disconnecting...
  client.on('LeaveRoom', () => {
    //remove player from room and notify other players (and update server data)
    removePlayersRoomData(client)
  });


  //DEPRECATED: Send Chat MEssage
  client.on('SendChatMessage', (message) => {
    let roomID = playersData["" + client.id].roomID
    let nickname = playersData["" + client.id].nickname
    //Add chat message to chat room message data
    roomsData["" + roomID].chatMessages.push(nickname + ": " + message)
    //Send updated messages to all players
    sendMessagesToRoom(client)
    //Retrieve update messages for client who sent message
    getUpdatedChatMessages(client)
  });

  //Message was added to the chat for the round
  client.on('SendMessageForRound', (message) => {
    let roomID = playersData["" + client.id].roomID
    let nickname = playersData["" + client.id].nickname
    let chatMessagesPerRound = roomsData["" + roomID].chatMessagesPerRound
    let chatRound = roomsData["" + roomID].chatRound

    if(chatMessagesPerRound.length < chatRound){
      chatMessagesPerRound.push({})
    }

    //Add chat message to chat room message data
    chatMessagesPerRound[chatRound-1][nickname] = message

    console.log(roomsData["" + roomID].chatMessagesPerRound[chatRound-1])

    let roundChatMessages = chatMessagesPerRound[chatRound-1]

    console.log(Object.keys(roundChatMessages))

    checkIfAllRoundMessagesSubmitted(client, roundChatMessages, roomID)

  });

  client.on('PlayerWasSelected', (playerNameText) => {
    let roomID = playersData["" + client.id].roomID
    let nickname = playersData["" + client.id].nickname
    let chatMessagesPerRound = roomsData["" + roomID].chatMessagesPerRound
    let votes = roomsData["" + roomID].votes

    if(votes.totalSubmitted){
      votes.totalSubmitted += 1
    } else {
      votes.totalSubmitted = 1
    }

    if(votes[playerNameText]){
      votes[playerNameText] += 1
    } else {
      votes[playerNameText] = 1
    }

    checkIfAllPlayersHaveSelected(client, votes, roomID)

  });


  //Player Disconnecting...
  client.on('disconnecting', () => {
    const rooms = Object.keys(client.rooms);
    console.log("Client disconnecting...");
    console.log(rooms)
  });

  //Player Disconnected
  client.on('disconnect', function(data) {
      console.log("Client disconnected");
      console.log("Client Data: " + data)
      console.log(client.rooms)
      //If Player was in any rooms, remove them from room and notify other players (and update server data)
      removePlayersRoomData(client)

      delete playersData["" + client.id]

      console.log(playersData)
  });


});

//SOCKET METHODS

//Create UUID for Player
function createPlayerID(client){
  let playerID = uuid();
  let username = uniqueNamesGenerator({ dictionaries: [colors, names] });
  var userData = {playerID: playerID, username: username}
  console.log(username)
  client.emit("SetPlayerID", userData)
}

// generate an integer in the range [x, y)
function generateRandomInterger(x,y){
  return Math.floor(x + (y - x) * Math.random());
}

//Create Room for Host
function successfullyCreatedRoom(client, roomIDValue, roomNameValue, hostUsername){
  roomsData[roomIDValue] = { players: [], roomName: roomNameValue, roomID: roomIDValue, round: 1, hasStarted: false}
  console.log("Creating Room....")
  console.log(roomsData[roomIDValue])
  client.emit("CreatedRoomWithID", {roomID: roomIDValue, roomName: roomNameValue})
}

//Message all other players of updates of player in rom
function updatePlayersInRoom(client, roomID){
  console.log("Updated Players in " + roomID)
  console.log(client.rooms)
  client.in(""+roomID).emit("UpdatePlayersInRoom", roomsData[roomID])
  //Check to see if room is empty
  checkIfRoomEmpty(roomID)
}

function getPlayersInRoom(client, roomID){
  client.emit("Getting Players in Room ", roomsData[roomID])
  client.emit("GetPlayersInRoom", roomsData[roomID])
}

function successfulyJoinedRoom(client, roomID){
  console.log("Successfully Joined Room " + roomID)
  client.emit("Successfully Joined Room ", roomsData[roomID])
  client.emit("SuccessfullyJoinedRoom", roomsData[roomID])
}

function failedJoiningRoom(client){
  console.log("Failed Joining Room...")
  client.emit("JoinRoomFailed")
}

function failedCreateRoom(client){
  console.log("Failed Creating Room...")
  client.emit("CreateRoomFailed")
}

function sendQuestionsToPlayer(client){
  client.emit("RecieveQuestions", questions)
}

function sendQuestionNumberToAllPlayers(client){
  let roomID = playersData["" + client.id].roomID
  console.log("Sending Question Number to Client...")
  console.log("currentQuestionNum: " + currentQuestionNum)
  client.in(""+roomID).emit("ReceiveQuestionNumber", currentQuestionNum)
}

function sendGameStatusToAllPlayers(client, statusData){
  var roomID = statusData.roomID
  console.log(statusData)
  roomsData[roomID].hasStarted = statusData.hasStarted
  console.log(roomsData[roomID])
  client.in(""+roomID).emit("HasGameStarted", statusData)
}

function verifyRoomStatus(client, roomID){
  console.log("Verify Room Status....")
  var hasStarted = roomsData[roomID].hasStarted;
  console.log(roomsData[roomID])
  console.log(hasStarted)
  client.emit("HasGameStarted", {hasStarted: hasStarted})
  client.emit("ReceiveQuestionNumber", currentQuestionNum)
}

function sendRoomInfoToPlayer(roomID,client){
  var currentRoomData = roomsData[roomID]
  console.log("Sending Room Info...")
  console.log(currentRoomData)
  client.emit("ReceiveGameRoomInfo", {roomName: currentRoomData.roomName})
}

function verifyRoomID(client, roomID){
  console.log("Verifying Room ID...")
  console.log(roomsData)
  console.log(roomsData[roomID])

  // roomsData
  if(roomsData[roomID]){
    console.log("Verifying ID...")
    console.log(roomsData[roomID])
    client.emit("WasRoomIDValid", true)
  } else {
    client.emit("WasRoomIDValid", false)
  }
}

function showAnswerToPlayers(client, roomID){
  client.in(""+roomID).emit("ShowAnswer")
}


function gameStarted(client) {
  let roomID = playersData["" + client.id].roomID
  client.in(""+roomID).emit("GameStarted")
}

function sendMessagesToRoom(client) {
  let roomID = playersData["" + client.id].roomID
  let chatMessages = roomsData["" + roomID].chatMessages
  client.in(""+roomID).emit("GetChatMessages", chatMessages)
}

function getUpdatedChatMessages(client){
  let roomID = playersData["" + client.id].roomID
  let chatMessages = roomsData["" + roomID].chatMessages
  client.emit("GetChatMessages", chatMessages)
}

function checkIfAllRoundMessagesSubmitted(client, roundChatMessages, roomID){

  let playersCount = roomsData["" + roomID].players.length
  let roundChatMessagesCount = Object.keys(roundChatMessages).length

  console.log("Player Count: " + playersCount)
  console.log("Chat Count: " + roundChatMessagesCount)

  if (roundChatMessagesCount >= playersCount){
    console.log("All Players sent Message")

    client.in(""+roomID).emit("AllMessagesRecieved")
    client.emit("AllMessagesRecieved")
    sendPlayersToSelect(client, roundChatMessages, roomID)
  } 
  else {
    console.log("Not All Players have Sent Message")
  }

}

function sendPlayersToSelect(client, roundChatMessages, roomID){
  let nickname = playersData["" + client.id].nickname
  let playersToSelect = {playerNickname: nickname, roundChatMessages: roundChatMessages }

  client.in(""+roomID).emit("PlayersToSelect", playersToSelect)
  client.emit("PlayersToSelect", playersToSelect)
}

function checkIfAllPlayersHaveSelected(client, votes, roomID){
  let players = roomsData["" + roomID].players
  let playersCount = players.length

  console.log("Player Count: " + playersCount)
  console.log("Vote Count: " + votes.totalSubmitted)

  if(votes.totalSubmitted >= playersCount){
    console.log("All Votes submitted")

    const voteKeys = Object.keys(votes);

    let votesPerPlayer = []

    //Set Votes per player so they can be ordered
    voteKeys.forEach(key => {
      //If not the key trsacking total votes, add to votesPerPlayer array
      if (key != "totalSubmitted"){
        votesPerPlayer.push({playerName: key, votes: votes[key]})
      }
    });

    console.log(votesPerPlayer)

    votesPerPlayer.sort((a, b) => b.votes - a.votes )

    console.log(votesPerPlayer)

    let playersWhoMayBeJudged = votesPerPlayer.slice(0,2)

    console.log("Players who may be Judged")
    console.log(playersWhoMayBeJudged)

    client.in(""+roomID).emit("PlayersWhoMayBeJudged", playersWhoMayBeJudged)
    client.emit("PlayersWhoMayBeJudged", playersWhoMayBeJudged)
  }

}




//SERVER METHODS

function removePlayersRoomData(client){

  console.log("Removing Client Data....")
  let playerData = playersData["" + client.id]

  console.log(playerData)

  if(!playerData) {
    return
  }

  let roomID = playersData["" + client.id].roomID
  let playerID = playersData["" + client.id].playerID
  let username = playersData["" + client.id].username

  //Client leaves room
  if(roomID){
    client.leave(roomID)

    //Remove assigend room from player data
    playersData["" + client.id].roomID = null

    let roomData = roomsData[roomID]

    if(roomData){

      let roomPlayersData = roomData.players

      //Find and remove player from room data
      const index = roomPlayersData.indexOf(username);

      if (index > -1) {
        roomPlayersData.splice(index, 1);
      }

      updatePlayersInRoom(client, roomID)
    }

  }
}



function assignRoomToPlayer(clientID, roomID){
  playersData["" + clientID].roomID = "" + roomID

  console.log(playersData)
}

function checkIfRoomEmpty(roomID){

  if(!roomsData["" + roomID]) {
    return
  }

  //If empty, remove from room list
  if(roomsData["" + roomID].players.length <=0) {
    delete roomsData["" + roomID]
  }

}

// ========================JSON===============

var questions = {
  "questions": [
      {"number":1,"question":"To much fanfare, Windows XP was released to manufacturing on August 24, 2001 and released to the general public in October that same year. When did Microsoft officially end support for Windows XP?","answer1":"2006","answer2":"2011","answer3":"2014","answer4":"Support is still on-going","correct":"2014","level":"1"},
      {"number":2,"question":"What's the name of the landscape wallpaper that was a default on Windows XP?","answer1":"Majesty","answer2":"Bliss","answer3":"Splendor","answer4":"Happiness","correct":"Bliss","level":"1"},
      {"number":3,"question":"The first webcam ever was deployed at Cambridge University, it was designed to monitor...?","answer1":"Crows nesting outside a laboratory window","answer2":"A coffee pot, to know when it was empty","answer3":"A lounge refrigerator, to catch a lunch thief","answer4":"A door, which was opened via motion detection","correct":"A coffee pot, to know when it was empty","level":"1"},
      {"number":4,"question":"Google Chrome has a hidden mini-game that involves what?","answer1":"A T-rex hurdling cacti","answer2":"ASCII Tetris","answer3":"Flappy Bird with a penguin","answer4":"A typing game","correct":"A T-rex hurdling cacti","level":"1"},
      {"number":5,"question":"A grand price fixing scheme that took place between 1998-2002 involved over a dozen makers, of what PC component?","answer1":"DRAM","answer2":"OEM Motherboards","answer3":"Laptop Displays","answer4":"Storage / HDDs","correct":"DRAM","level":"1"},
      {"number":6,"question":"What is the world's best-selling PC game?","answer1":"Minecraft","answer2":"World of Warcraft","answer3":"Half-Life 2","answer4":"Doom","correct":"Minecraft","level":"1"},
      {"number":7,"question":"Google Chrome has a hidden mini-game that involves what?","answer1":"A T-rex hurdling cacti","answer2":"ASCII Tetris","answer3":"Flappy Bird with a penguin","answer4":"A typing game","correct":"A T-rex hurdling cacti","level":"1"},
      {"number":8,"question":"To fund the creation of Apple's first computer, Steve Wozniak and Steve Jobs sold...","answer1":"Scientific calculator and Volkswagen van","answer2":"Rights to video game 'Breakout' to Atari","answer3":"Blue box devices to simulate phone operators","answer4":"Blueprints for a second generation computer","correct":"Scientific calculator and Volkswagen van","level":"1"},
      {"number":9,"question":"Where did the name 'Bluetooth' come from?","answer1":"A medieval Scandinavian king ","answer2":"An electric eel with blue teeth ","answer3":"A bear that loves blueberries  ","answer4":"A Native American chieftain","correct":"A medieval Scandinavian king ","level":"1"},
      {"number":10,"question":" How many Gigabytes are in a Petabyte?","answer1":"2,048 Gigabytes","answer2":"40,096 Gigabytes","answer3":"200,480 Gigabytes","answer4":"1,000,000 Gigabytes","correct":"1,000,000 Gigabytes","level":"1"},
      {"number":11,"question":"What is the world's best-selling PC game?","answer1":"Minecraft","answer2":"World of Warcraft","answer3":"Half-Life 2","answer4":"Doom","correct":"Minecraft","level":"1"},
      {"number":12,"question":"What's the name of the landscape wallpaper that was a default on Windows XP?","answer1":"Majesty","answer2":"Bliss","answer3":"Splendor","answer4":"Happiness","correct":"Bliss","level":"1"},
      {"number":13,"question":"What did the ESP button do on portable CD players?","answer1":"Shuffled your playlist","answer2":"Prevented songs from skipping","answer3":"Changed your equalizer profile","answer4":"Protected against electrostatic shock","correct":"Prevented songs from skipping","level":"1"},
      {"number":14,"question":"Which of the following was not a x86 CPU maker?","answer1":"Cyrix","answer2":"Motorola","answer3":"IBM","answer4":"VIA","correct":"Motorola","level":"1"},
      {"number":15,"question":"What's the name of the landscape wallpaper that was a default on Windows XP?","answer1":"Majesty","answer2":"Bliss","answer3":"Splendor","answer4":"Happiness","correct":"Bliss","level":"1"},
      {"number":16,"question":"When Verizon bought AOL in 2015, how many people were still paying for AOL dial-up Internet?","answer1":"Half a million and growing in rural US","answer2":"120,000 holdouts across rural US","answer3":"1,200 accounts unknowingly subscribed","answer4":"2.1 million, down from 3 million in 2012","correct":"2.1 million, down from 3 million in 2012","level":"1"},
      {"number":17,"question":"Google Chrome has a hidden mini-game that involves what?","answer1":"A T-rex hurdling cacti","answer2":"ASCII Tetris","answer3":"Flappy Bird with a penguin","answer4":"A typing game","correct":"A T-rex hurdling cacti","level":"1"},
      {"number":18,"question":"A 'platform upgrade' involves swapping which core PC components?","answer1":"Hard drive, GPU and RAM","answer2":"CPU, GPU and motherboard","answer3":"CPU, RAM and motherboard","answer4":"It's actually a full rebuild","correct":"CPU, RAM and motherboard","level":"1"},
      {"number":19,"question":"Where did the name 'Bluetooth' come from?","answer1":"A medieval Scandinavian king ","answer2":"An electric eel with blue teeth ","answer3":"A bear that loves blueberries  ","answer4":"A Native American chieftain","correct":"A medieval Scandinavian king ","level":"1"},
      {"number":20,"question":"What was the first computer to win a chess match against a world champion (under regular time constraints)?","answer1":"IBM Watson","answer2":"IBM Deep Blue","answer3":"Cray Jaguar","answer4":"IBM Blue Gene","correct":"IBM Deep Blue","level":"1"},
      {"number":21,"question":"Founded in 1889, Nintendo got its start by selling what product?","answer1":"Playing cards","answer2":"Wooden figurines","answer3":"Board games","answer4":"Comic books","correct":"Playing cards","level":"1"},
      {"number":22,"question":"The first computer mouse: how many buttons did it have, and what material was it made of?","answer1":"Had a single button, was made of metal","answer2":"Had two buttons, was made of plastic","answer3":"Had one button, was made of wood","answer4":"Had one button, was made of plastic","correct":"Had one button, was made of wood","level":"1"},
      {"number":23,"question":"What was Comdex before it was shut down in the early 2000s?","answer1":"A tech recycling firm that became Newegg","answer2":"An online index of web domains for sale","answer3":"One of the largest technology trade shows","answer4":"The first online multiplayer card game","correct":"One of the largest technology trade shows","level":"1"},
      {"number":24,"question":"In 2010, the U.S. Air Force used over 1,000 game consoles to build a supercomputer: Which one?","answer1":"Xbox","answer2":"PlayStation 3","answer3":"Nintendo Wii","answer4":"Xbox 360","correct":"PlayStation 3","level":"1"},
      {"number":25,"question":"Android versions are named after dessert foods. They're also released...","answer1":"Every nine months","answer2":"On the birthdays of visionaries","answer3":"On even months because it's good luck","answer4":"In alphabetical order","correct":"In alphabetical order","level":"1"},
      {"number":26,"question":"Without attaching additional power cables, how much can a PCIe x16 graphics card draw from the motherboard's slot?","answer1":"25W","answer2":"75W","answer3":"150W","answer4":"300W","correct":"75W","level":"1"},
      {"number":27,"question":"Where is the grave/tilde key on a standard US/UK QWERTY keyboard?","answer1":"On the number pad","answer2":"Above Enter and below Backspace","answer3":"Above the arrow keys","answer4":"Above Tab and below Escape","correct":"Above Tab and below Escape","level":"1"},
      {"number":28,"question":"To fund the creation of Apple's first computer, Steve Wozniak and Steve Jobs sold...","answer1":"Scientific calculator and Volkswagen van","answer2":"Rights to video game 'Breakout' to Atari","answer3":"Blue box devices to simulate phone operators","answer4":"Blueprints for a second generation computer","correct":"Scientific calculator and Volkswagen van","level":"1"},
      {"number":29,"question":"What was the first cross-platform web browser (circa 1993)?","answer1":"Mosaic","answer2":"Cello","answer3":"Nexus","answer4":"Internet Explorer","correct":"Mosaic","level":"1"},
      {"number":30,"question":"What did the ESP button do on portable CD players?","answer1":"Shuffled your playlist","answer2":"Prevented songs from skipping","answer3":"Changed your equalizer profile","answer4":"Protected against electrostatic shock","correct":"Prevented songs from skipping","level":"1"},
      {"number":31,"question":"Before becoming widely recognized the main character of Super Mario Bros., what was Mario named?","answer1":"Hammer Jump","answer2":"Hopguy","answer3":"Jumpman","answer4":"Bouncing Carpenter","correct":"Jumpman","level":"1"},
      {"number":32,"question":"Without actually typing it in, where does Relentless.com bring you?","answer1":"Microsoft.com","answer2":"Apple.com","answer3":"Amazon.com","answer4":"Google.com","correct":"Amazon.com","level":"2"},
      {"number":33,"question":"Larry Page and Sergey Brin decided on Eric Schmidt as Google's CEO in 2001 for reasons including his attendance of what event?","answer1":"The launch of Apollo 11","answer2":"Burning Man","answer3":"The Bilderberg conference","answer4":"Def Con before it was Def Con","correct":"Burning Man","level":"2"},
      {"number":34,"question":"Who said this in 2004: 'Two years from now, (email) spam will be solved.'?","answer1":"Bill Gates, co-founder of Microsoft","answer2":"Steve Jobs, co-founder of Apple","answer3":"Marc Andreessen, founder of Netscape","answer4":"Tim Berners-Lee, inventor of the World Wide Web","correct":"Bill Gates, co-founder of Microsoft","level":"2"},
      {"number":35,"question":"If you were buying a solid state drive, which of these would be the fastest, most durable type of NAND flash memory?","answer1":"SLC","answer2":"MLC","answer3":"eMLC","answer4":"TLC","correct":"SLC","level":"2"},
      {"number":36,"question":"Which of these companies invented Ethernet networking?","answer1":"Cisco","answer2":"Xerox","answer3":"Packard Bell","answer4":"AT&T","correct":"Xerox","level":"2"},
      {"number":37,"question":"If you reach level 256 in the game Pac-Man, this infamous bug will cause the arcade game to...","answer1":"Render half of the screen wrong  ","answer2":"Lock up on an all-black screen","answer3":"Flip the board upside down","answer4":"Display monochrome graphics","correct":"Render half of the screen wrong  ","level":"2"},
      {"number":38,"question":"Valve co-founder Gabe Newell is a former Microsoftie, he led a team that ported what classic game to Windows 95?","answer1":"Wolfenstein 3D","answer2":"Doom","answer3":"Duke Nukem 3D","answer4":"Quake","correct":"Doom","level":"2"},
      {"number":39,"question":"The first 5MB hard drive weighed approximately...","answer1":"25 pounds","answer2":"50 pounds","answer3":"250 pounds","answer4":"Over a ton","correct":"Over a ton","level":"2"},
      {"number":40,"question":"There were 1,000 Internet devices in 1984. By 1992, that figure reached...","answer1":"100000","answer2":"1 million ","answer3":"100 million","answer4":"1 billion","correct":"1 million ","level":"2"},
      {"number":41,"question":"Google's first tweet on Twitter was a message encoded in binary that read what?","answer1":"Don't be evil","answer2":"I'm feeling lucky","answer3":"Do the right thing","answer4":"Is this thing on?","correct":"I'm feeling lucky","level":"2"},
      {"number":42,"question":"What was the first Android mobile phone?","answer1":"HTC Dream","answer2":"Samsung Moment","answer3":"T-Mobile MyTouch 3G","answer4":"Motorola Cliq","correct":"HTC Dream","level":"2"},
      {"number":43,"question":"Who said this in 2004: 'Two years from now, (email) spam will be solved.'?","answer1":"Bill Gates, co-founder of Microsoft","answer2":"Steve Jobs, co-founder of Apple","answer3":"Marc Andreessen, founder of Netscape","answer4":"Tim Berners-Lee, inventor of the World Wide Web","correct":"Bill Gates, co-founder of Microsoft","level":"2"},
      {"number":44,"question":"Larry Page and Sergey Brin decided on Eric Schmidt as Google's CEO in 2001 for reasons including his attendance of what event?","answer1":"The launch of Apollo 11","answer2":"Burning Man","answer3":"The Bilderberg conference","answer4":"Def Con before it was Def Con","correct":"Burning Man","level":"2"},
      {"number":45,"question":"The first 5MB hard drive weighed approximately...","answer1":"25 pounds","answer2":"50 pounds","answer3":"250 pounds","answer4":"Over a ton","correct":"Over a ton","level":"2"},
      {"number":46,"question":"Windows Millennium Edition (ME) shipped with all of these features, except...","answer1":"Automatic Windows updates","answer2":"File system encryption","answer3":"System Restore","answer4":"Online Windows games","correct":"File system encryption","level":"2"},
      {"number":47,"question":"Which video game franchise has collectively sold the most copies?","answer1":"Madden NFL","answer2":"Mario","answer3":"Grand Theft Auto","answer4":"Pokémon","correct":"Mario","level":"2"},
      {"number":48,"question":"What is the most commonly used password?","answer1":"password","answer2":"123456","answer3":"Google","answer4":"qwerty","correct":"123456","level":"2"},
      {"number":49,"question":"The original iPod had an Easter Egg accessed by holding down the center button for a few seconds on the 'About' menu. What was it?","answer1":"A version of the game Breakout for Atari","answer2":"Pac-Man with the Apple logo as the main character","answer3":"Solitaire with Apple executives on the cards","answer4":"Steve Jobs was strictly against Easter Eggs","correct":"A version of the game Breakout for Atari","level":"2"},
      {"number":50,"question":"Where would you purchase a mobile phone expecting it to be waterproof as the norm?","answer1":"South Korea","answer2":"Japan","answer3":"Taiwan","answer4":"Hong Kong","correct":"Japan","level":"2"},
      {"number":51,"question":"What's the keyboard shortcut to directly open the Windows Task Manager?","answer1":"Ctrl+Alt+Delete","answer2":"Ctrl + Shift + Escape","answer3":"Win + Alt + Delete","answer4":"Ctrl + Alt + T","correct":"Ctrl + Shift + Escape","level":"2"},
      {"number":52,"question":"Released in 1984, the Motorola DynaTAC was the first commercially available mobile phone. It was priced at...","answer1":"669","answer2":"995","answer3":"1999","answer4":"3995","correct":"3995","level":"2"},
      {"number":53,"question":"What is the best-selling desktop personal computer of all time?","answer1":"Commodore 64","answer2":"IBM PC","answer3":"Apple II","answer4":"Atari 800","correct":"Commodore 64","level":"2"},
      {"number":54,"question":"Who said this in 2004: 'Two years from now, (email) spam will be solved.'?","answer1":"Bill Gates, co-founder of Microsoft","answer2":"Steve Jobs, co-founder of Apple","answer3":"Marc Andreessen, founder of Netscape","answer4":"Tim Berners-Lee, inventor of the World Wide Web","correct":"Bill Gates, co-founder of Microsoft","level":"2"},
      {"number":55,"question":"Valve co-founder Gabe Newell is a former Microsoftie, he led a team that ported what classic game to Windows 95?","answer1":"Wolfenstein 3D","answer2":"Doom","answer3":"Duke Nukem 3D","answer4":"Quake","correct":"Doom","level":"2"},
      {"number":56,"question":"What was the first personal computer to be offered commercially with a graphical user interface?","answer1":"Apple Lisa ","answer2":"Commodore Amiga","answer3":"SGI IRIS 1000","answer4":"Tandy DeskMate","correct":"Apple Lisa ","level":"2"}
    ]
}

