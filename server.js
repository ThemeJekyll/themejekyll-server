#!/bin/env node
var express = require('express')
var bodyParser = require('body-parser')
var request = require('request')
var fs = require('fs')
var cors = require('cors')
var githubMiddleware = require('github-webhook-middleware')({
  secret: "ENTER_SECRET_HERE",
  limit: '10mb'
})

var server_port = process.env.OPENSHIFT_NODEJS_PORT || 8080
var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1'

// Double underscore because (according to StackExchange) its better to do it this way in Node
var __ = require('underscore')
var themes = require('./themes.json')
var banned = require('./banned.json')

var app = express()

var corsOptions = {
  origin: 'https://themejekyll.github.io',
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}

var jsonParser = bodyParser.json({type:'application/json'})
app.use(cors(corsOptions))

function saveThemeDB(){
  fs.writeFile("themes.json", JSON.stringify(themes), "utf8")
}

function saveBannedDB(){
  fs.writeFile("banned.json", JSON.stringify(banned), "utf8")
}

function updateThemesDB(){
  console.log('update theme db')
  request('https://themejekyll.github.io/themes.json?time='+(new Date()).getTime(), function (error, response, body) {
    var returnedThemes = JSON.parse(body)
    returnedThemes.forEach(function(theme){
      var searchTheme = __.findWhere(themes, {url: theme.url})
      if (searchTheme){
        theme['stars'] = []
        theme.stars[0] = searchTheme.stars[0]
        theme.stars[1] = searchTheme.stars[1]
        theme.stars[2] = searchTheme.stars[2]
        theme.stars[3] = searchTheme.stars[3]
        theme.stars[4] = searchTheme.stars[4]
        theme.stars[5] = searchTheme.stars[5]
        theme.stars[6] = searchTheme.stars[6]
      }
      else{
        theme['stars'] = []
        theme.stars[0] = 0
        theme.stars[2] = 0
        theme.stars[1] = 0
        theme.stars[3] = 0
        theme.stars[4] = 0
        theme.stars[5] = 0
        theme.stars[6] = 0
      }
    })
    themes = returnedThemes
    saveThemeDB()
  })
}

function notBanned(ip, url){
  var user = __.findWhere(banned, {ip: ip})
  if (user !== undefined){
    var theme = __.findIndex(user.themes, {theme: url})
    if (theme !== -1){
      if (user.themes[theme].time < new Date() / 1000 - 86400){
        user.themes.splice(theme, 1)
        return true
      }
      else{
        return false
      }
    }
    else{
      return true
    }
  }
  else{
    return true
  }
}

function getAverage(ratings){
  return Math.round(((ratings[1]*1 + ratings[2]*2 + ratings[3]*3 + ratings[4]*4 + ratings[5]*5) / (ratings[1] + ratings[2] + ratings[3] + ratings[4] + ratings[5])) * 10) / 10
}

updateThemesDB()


app.get('/', cors(), function (req, res){
  res.send(themes)
})

app.post('/', cors(), function (req, res){
  res.send(themes)
})

app.post('/webhook', githubMiddleware, function (req, res){
  console.log('got webhook')
  if (req.headers['x-github-event'] === 'page_build'){
    console.log('updating db')
    updateThemesDB()
  }
  return res.status(200).end()
})

app.post('/star', jsonParser, function (req, res){
  var themeIndex = __.findIndex(themes, {url: req.body.url})
  if (themeIndex !== -1){
    if (req.body.stars > 0 && req.body.stars < 6){
      if (notBanned(req.ip, req.body.url)){
        themes[themeIndex].stars[req.body.stars] = themes[themeIndex].stars[req.body.stars] + 1
        themes[themeIndex].stars[0] = getAverage(themes[themeIndex].stars)
        themes[themeIndex].stars[6] = themes[themeIndex].stars[1] + themes[themeIndex].stars[2] + themes[themeIndex].stars[3] + themes[themeIndex].stars[4] + themes[themeIndex].stars[5]
        saveThemeDB()
        var user = __.findWhere(banned, {ip:req.ip})
        if (user){
          user.themes.push({theme: req.body.url, time: new Date() / 1000})
        }
        else{
          banned.push({ip: req.ip, themes: [{theme: req.body.url, time: new Date() / 1000}]})
        }
        saveBannedDB()
        res.send(200)
      }
      else{
        res.send(403)
        return
      }
    }
    else{
      res.send(403)
      return
    }
  }
  else{
    res.send(404)
  }
})

app.post('/stars', jsonParser, function (req, res) {
  req.header('Access-Control-Allow-Origin', '*')
  var theme = __.findWhere(themes, {url: req.body.url})
  if (theme){
    res.send(JSON.stringify({stars: theme.stars}))
  }
  else{
    res.send(404)
  }
})

app.post('/update', jsonParser, function (req, res){
  res.send(__.findWhere(themes, {url: req.body.url}))
})

setInterval(function(){
  banned.forEach(function(user){
    user.themes.forEach(function(theme){
      if (theme.time < new Date() / 1000 - 86400){
        user.themes.splice(theme.index, 1)
      }
      if (user.themes.length == 0){
        banned.splice(user.index, 1)
      }
    })
  })
  saveBannedDB()
}, 24*60*60*100)

app.listen(server_port, server_ip_address, function (){
})
