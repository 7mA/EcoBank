'use strict';

module.exports = function(Ecobankusers) {
  var app = require('../../server/server');

  Ecobankusers.disableRemoteMethod("upsert", true);
  Ecobankusers.disableRemoteMethod("updateAll", true);
  Ecobankusers.disableRemoteMethod("updateAttributes", false);

  Ecobankusers.disableRemoteMethod("find", true);
  Ecobankusers.disableRemoteMethod("findById", true);
  Ecobankusers.disableRemoteMethod("findOne", true);

  Ecobankusers.disableRemoteMethod("deleteById", true);

  Ecobankusers.disableRemoteMethod("confirm", true);
  Ecobankusers.disableRemoteMethod("count", true);
  Ecobankusers.disableRemoteMethod("exists", true);

  /**
   * 创建新订单的钩函数
   * 需要做：1、生成订单时间
   * 2、检查产品Id、购买金额是否符合要求
   */
  Ecobankusers.beforeRemote("prototype.__create__orders", function (context, unused, next) {
    var productsModel = app.models.Products;
    var productId = context.req.body.held_product_id;
    var holdInvestment = context.req.body.held_investment;

    productsModel.getProductById(productId, function (unused, result) {
      if(result == null){
        context.res.status(400).send({
          error: "no product with id " + productId
        });
      }else{
        var entry = parseFloat(result.purchase_entry);
        if(holdInvestment < entry){
          context.res.status(400).send({
            error: "held investment is lower than purchase entry " + entry
          });
        }
      }
    });
    next();
  });

  var app = require('../../server/server');

  //单张卡信息cache
  var cachedCards = Array();


  function findCardByIdInCache(id) {
    console.log("findCardByIdInCache: " + cachedCards.length);
    for(var i = 0; i < cachedCards.length; i ++){
      if(cachedCards[i].card_num == id ){
        return cachedCards[i];
      }
    }
    return null;
  }

  function findUserAllCardsInCache(userId){
    for(var i = 0; i < cachedUserAllCards.length; i++){
      if(cachedUserAllCards[i].userId == userId){
        return cachedUserAllCards[i];
      }
    }
    return null;
  }

  /**
   * 从context中获取请求历史的startdate和enddate
   * 检查参数的有效性
   * @param context express上下文信息
   */
  function checkQueryHistoryPara(context) {
    var startdate = context.req.query.startdate;
    var enddate = context.req.query.enddate;
  }

  //用户所有卡cache
  var cachedUserAllCards = Array();

  /**
   * 从context中获取请求的用户的id(id)
   * 首先从cache中查询，如果cache中没有，调用Cards的
   * getCards方法，从数据源中查询，将查询结果存入cache
   * @param context express上下文信息
   */
  function cacheCardsInfo(context) {
    var userId = context.req.query.id;
    var cachedUserAllCards = findUserAllCardsInCache(userId);

    if(cachedUserAllCards == null) {
      Ecobankusers.prototype.__get__cards(userId, function (err, instance) {
        if (err){
          //response: loopback server error.
          context.res.status(500).send({
            error : "loopback server error",
            detail : err
          });
        }
        if (instance == null) {
          console.log("cacheCardInfo : user id does not exist.");
          //response: query id does not exist.
          context.res.status(400).send({
            error: "query parameter error",
            detail: "user with queried id does not exist."
          });
        } else {
          console.log("cacheCardInfo : card instance push into cache");
          cachedCards.push({
            userId : userId,
            cards: instance
          });
        }
      });
    }else {
      console.log("cacheCardInfo : instance is found in cache.");
    }
  }


  /**
   * singleBalance方法钩函数
   * 在query single balance之前准备card信息
   */
  Ecobankusers.beforeRemote("singleBalance", function (context, instance, next) {
    console.log("before remote balance");
   // cacheSingleCardInfo(context);
    next();
  });

  /**
   * 查询一个用户所持有的特定卡balance
   * @param id 用户id
   * @param fk 卡id
   * @param cb callback
   */
  Ecobankusers.singleBalance = function (id, fk, cb) {
    var cardsModel = app.models.Cards;
    //查询卡片信息
    cardsModel.findById(fk, function (err, instance) {
      if (err){
        //response: loopback server error.
        context.res.status(500).send({
          error : "loopback server error",
          detail : err
        });
      }
      if (instance == null) {
        console.log("cacheCardInfo : query id does not exist.");
        //response: query id does not exist.
        cb(null, "query parameter error");
      }
      else{
        //根据卡片信息去后台查询信息
        var backendModel = app.models.Backend;
        var cardInfo = instance;
        //console.log=(cardInfo.card_num+" "+cardInfo.userId);

        if(cardInfo.bank == "Orange"){
          backendModel.queryBalanceOrange(cardInfo.card_num, function (err, response, cxt) {
            console.log("begin callback");
            if (err) throw err; //error making request
            if (response.error) {
              cxt.res.status(500).send("backend server error.");
            }
            var balanceObj = {
              card_num: cardInfo.card_num,
              bank: cardInfo.bank,
              asset: response.QBALANOROperationResponse.cust_balance.balance
            };
            console.log("begin callback " + balanceObj.asset);
            cb(null, balanceObj);
          });
        }else if(cardInfo.bank == "Coconut"){
          backendModel.queryBalanceCoconut(cardInfo.card_num, function (err, response, cxt) {
            console.log("begin callback");
            if (err) throw err; //error making request
            if (response.error) {
              cxt.res.status(500).send("backend server error.");
            }
            var balanceObj = {
              card_num: cardInfo.card_num,
              bank: cardInfo.bank,
              asset: response.QBALANCOOperationResponse.cust_balance.balance
            };
            cb(null, balanceObj);
          });
        }else{
          cb(null, "parameter error");
        }
      }
    });
  };


  /**
   * 查询一个用户所有卡的balance以及合计balance
   * @param id 用户id
   * @param cb callback
   */
  Ecobankusers.balance = function (id, cb) {

    var cardModel = app.models.Cards;
    cardModel.find(function (error, cards) {

      var toQueryCards = new Array();
      for(var i = 0 ; i < cards.length; i ++){
        if(cards[i].userid == id){
          toQueryCards.push(cards[i]);
        }
      }

      var progress = 0;

      var balanceObj = {
        card_num: "all",
        bank: "-",
        asset: 0
      };

      if(toQueryCards.length == 0){
        cb(null, balanceObj);
      }

      for(var i = 0; i < toQueryCards.length; i ++){
        Ecobankusers.singleBalance(id, toQueryCards[i].card_num, function (unused, balance) {
          progress ++;
          balanceObj.asset += balance.asset;
          if(progress == toQueryCards.length){
            cb(null, balanceObj);
          }
        });
      }
    });
  }


  /**
   * singleHistory方法钩函数
   * 在query single History之前准备card信息
   */
  Ecobankusers.beforeRemote("singleHistory", function (context, instance, next) {
    console.log("before remote history");
  //  cacheSingleCardInfo(context);
    next();
  });

  /**
   * 查询单张卡的交易历史
   * @param id 用户id
   * @param fk 卡号
   * @param startdate 开始日期，格式为yyyyMMdd的字符串
   * @param enddate 结束日期，格式为yyyyMMdd的字符串
   * @param cb callback回调函数
   */
  Ecobankusers.singleHistory = function (id, fk, startdate, enddate, cb) {
    var cardsModel = app.models.Cards;
    //查询卡片信息
    cardsModel.findById(fk, function (err, instance) {
      if (err){
        //response: loopback server error.
        context.res.status(500).send({
          error : "loopback server error",
          detail : err
        });
      }
      if (instance == null) {
        console.log("cacheCardInfo : query id does not exist.");
        //response: query id does not exist.
        cb(null, "query parameter error");
      }
      else{
        //根据卡片信息去后台查询信息
        var backendModel = app.models.Backend;
        var cardInfo = instance;

        if(cardInfo.bank == "Orange"){
          backendModel.queryTrnHistOrange(cardInfo.card_num, startdate, enddate, function (err, response, cxt) {
            console.log("begin callback");
            if (err) throw err; //error making request
            if (response.error) {
              next('> response error: ' + response.error.stack);
            }

            cb(null, response.QTRNHIO1OperationResponse.trans_history.trans_detail);
          });
        }else if(cardInfo.bank == "Coconut"){
          backendModel.queryTrnHistCoconut(cardInfo.card_num, startdate, enddate, function (err, response, cxt) {
            console.log("begin callback");
            if (err) throw err; //error making request
            if (response.error) {
              next('> response error: ' + response.error.stack);
            }
            console.log("queryCardHistoryInBackend : " + response.QTRNHIC1OperationResponse.trans_history.trans_detail.length);

            cb(null, response.QTRNHIC1OperationResponse.trans_history.trans_detail);
          });
        }else{
          cb(null, "parameter error");
        }
      }
    });
  }

  function statisticsAdd(result, label, value) {
    for(var i = 0; i < result.length; i ++){
      if(result[i].xAxis == label){
        result[i].yAxis += value;
        return;
      }
    }
    result.push({
      xAxis : label,
      yAxis : value
    });
  }


  /**
   * 对数据进行统计工作
   * @param id 用户Id
   * @param fk 卡Id
   * @param ty 统计类型
   * @param cb 回调函数
   */
  Ecobankusers.singleStatistics = function (id, fk, bymonth, startdate, enddate, cb) {
    //查询历史记录
    Ecobankusers.singleHistory(id, fk, startdate, enddate, function (unused, history) {
      console.log("history item " + history.length);

      var result = Array();

      for(var i = 0; i < history.length; i ++){
        console.log("history item " + history[i].tran_amount);
        if(bymonth){
          statisticsAdd(result, history[i].issue_date.substring(0, 6),
            history[i].tran_amount);
        }
        else {
          statisticsAdd(result, history[i].merchant_type,
            history[i].tran_amount);
        }
      }
      cb(null, result);
    });
  }

  Ecobankusers.history = function (id, startdate, enddate, cb) {

    var cardModel = app.models.Cards;
    cardModel.find(function (error, cards) {

      var toQueryCards = new Array();
      for(var i = 0 ; i < cards.length; i ++){
        if(cards[i].userid == id){
          toQueryCards.push(cards[i]);
        }
      }

      var progress = 0;
      var allHistory = new Array();

      if(toQueryCards.length == 0){
        cb(null, allHistory);
      }

      for(var i = 0; i < toQueryCards.length; i ++){
        Ecobankusers.singleHistory(id, toQueryCards[i].card_num, startdate, enddate, function (unused, history) {
          allHistory = allHistory.concat(history);
          progress ++;
          if(progress == toQueryCards.length){
            cb(null, allHistory);
          }
        });
      }
    });
  }

  Ecobankusers.statistics = function (id, bymonth, startdate, enddate, cb) {
    //查询历史记录
    Ecobankusers.history(id, startdate, enddate, function (unused, history) {
      console.log("history item " + history.length);

      var result = Array();

      for(var i = 0; i < history.length; i ++){
        console.log("history item " + history[i].tran_amount);
        if(bymonth){
          statisticsAdd(result, history[i].issue_date.substring(0, 6),
            history[i].tran_amount);
        }
        else {
          statisticsAdd(result, history[i].merchant_type,
            history[i].tran_amount);
        }
      }
      cb(null, result);
    });
  }

  Ecobankusers.queryPaymentByUserd= function (id, merchantid, merchantname, money, cb) {
        var cardModel = app.models.Cards;
        var backendModel = app.models.Backend;
        cardModel.find(function (error, cards) {

            var toQueryCards = new Array();
            for(var i = 0 ; i < cards.length; i ++){
                if(cards[i].userid == id){
                    toQueryCards.push(cards[i]);
                }
            }

            var progress = 0;
            var Querymess = new Array();

            if(toQueryCards.length == 0){
                cb(null, Querymess);
            }
            var of = false;
            var cf = false;
            for(var i = 0; i < toQueryCards.length; i ++) {
                if (toQueryCards[i].bank == "Orange" && of == false){
                    of = true;
                }
                if (toQueryCards[i].bank == "Coconut" && cf == false){
                    cf = true;
                }
            }
            var Money = parseFloat(money);
            //cb(null,Querymess);
            backendModel.queryPrivilege(merchantid, Money, function (err, response, cxt){
                console.log("begin callback queryPrivilege"+Money);
                if (err) {
                    console.log("Error");
                    throw err; //error making request
                }
                if (response.error) {
                    next('> response error: ' + response.error.stack);
                }
                for(var i = 0; i < response.QPRIVIL1OperationResponse.lowest_amount_paid.bank_amount_paid.length; i++)
                {
                  if(response.QPRIVIL1OperationResponse.lowest_amount_paid.bank_amount_paid[i].bankname == "COCONUT" && cf ==true)
                    Querymess.push(response.QPRIVIL1OperationResponse.lowest_amount_paid.bank_amount_paid[i]);
                  if(response.QPRIVIL1OperationResponse.lowest_amount_paid.bank_amount_paid[i].bankname == "ORANGE" && of==true)
                        Querymess.push(response.QPRIVIL1OperationResponse.lowest_amount_paid.bank_amount_paid[i]);
                }
                cb(null, Querymess);
                //cb(null, response.QPRIVILOperationResponse.lowest_amount_paid.bank_amount_paid);
            });
        });
  }

  Ecobankusers.Pay = function (id, fk, password, merchantname, buildingpoi, money, cb) {
        var cardModel = app.models.Cards;
        var backendModel = app.models.Backend;
        var key = "04ccbeb4231f3b05f5cfc52ea4ea5188";
        var output = "JSON";
        var card = null;
        var typecode = null;
        var Money = parseFloat(money);
      var fs = require('fs');


        cardModel.find(function (error, cards) {
            for(var i = 0 ; i < cards.length; i ++){
                if(cards[i].userid == id && cards[i].card_num == fk){
                    card = cards[i];
                    console.log("Card has been found");
                }
            }
            if(Money == 0)
            {
                var response = {
                    "ca_return_code" : 13,
                    "pay_response_message" : "Money cannot be 0!"
                };
                cb(null, response);
            }
            if(card == null){
                var response = {
                    "ca_return_code" : 10,
                    "pay_response_message" : "User's card not found!"
                };
                cb(null, response);
            }
            else {
                if(password == card.query_password){
                    backendModel.searchMerchant(key, buildingpoi, output, function (err, response, cxt) {
                        if (err) {
                            console.log("Gaode error");
                            throw err; //error making request
                        }

                        if (response.error) {
                            next('> response error: ' + response.error.stack);
                        }
                        console.log(response);
                        if (response.status == "1" && response.count == "1") {
                            typecode = response.pois[0].typecode;
                            var type = typecode.slice(0,4);
                            console.log("typecode:" + response.pois.typecode + " " + typecode);
                            var Money = parseFloat(money);
                            if (card.bank == "Coconut") {
                                //cb(null,Querymess);
                                backendModel.PayCoconut(Money, buildingpoi, merchantname, type, card.card_num, function (err, response, cxt) {
                                    console.log("begin callback PayCoco" + Money);
                                    if (err) {
                                        console.log("Error");
                                        throw err; //error making request
                                    }
                                    if (response.error) {
                                        next('> response error: ' + response.error.stack);
                                    }
                                    var data = id + ",1.0," +  buildingpoi +"\r";
                                    fs.appendFile('history.csv', data, function (err) {
                                        if (err) {
                                            console.log(err);
                                        }
                                        else {
                                            console.log("writedata" + data);
                                        }
                                    });
                                    cb(null, response.PAYCOCO1OperationResponse);
                                    //cb(null, response.QPRIVILOperationResponse.lowest_amount_paid.bank_amount_paid);
                                });
                            }
                            if (card.bank == "Orange") {
                                //cb(null,Querymess);
                                backendModel.PayOrange(Money, buildingpoi, merchantname, type, card.card_num, function (err, response, cxt) {
                                    console.log("begin callback PayCoco" + Money);
                                    if (err) {
                                        console.log("Error");
                                        throw err; //error making request
                                    }
                                    if (response.error) {
                                        next('> response error: ' + response.error.stack);
                                    }
                                    var data = id + ",1.0," +  buildingpoi +"\r";
                                    fs.appendFile('history.csv', data, function (err) {
                                        if (err) {
                                            console.log(err);
                                        }
                                        else {
                                            console.log("writedata" + data);
                                        }
                                    });
                                    cb(null, response.PAYORAN1OperationResponse);
                                    //cb(null, response.QPRIVILOperationResponse.lowest_amount_paid.bank_amount_paid);
                                });
                            }
                        }
                        else {
                            var responsem = {
                                "ca_return_code" : 11,
                                "pay_response_message" : "Merchant not found!"
                            };
                            cb(null, responsem);
                        }
                    });
                }
                else{
                    var responsec = {
                        "ca_return_code" : 12,
                        "pay_response_message" : "Wrong password!"
                    };
                    cb(null, responsec);
                }

            }
        });
    }

    Ecobankusers.searchothershistory = function(cb){
        var cardModel = app.models.Cards;
        var backendModel = app.models.Backend;
        var fs = require('fs');
        cardModel.find(function (error, cards){
            for(var i = 0; i < cards.length; i++){
                var data = cards[i].userid + ",1.0," + cards[i].card_num;
                fs.writeFile('history.csv', data, function (err) {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log(data);
                    }
                });
            }
            cb(null, cards);
        });
    }

    Ecobankusers.Merchantsid = null;
    Ecobankusers.Privilege = null;
    Ecobankusers.MerchantsP = new Map();

    Ecobankusers.searchMerchantAroundByType = function(location, types, radius, cb){
        var backendModel = app.models.Backend;
        var pageall = 0;
        var pagenum = 1;
        var poiall = new Array();
        var progresspage = 0;
        var progress = 0;
        var Merchant = Array();
        var p = pagenum.toString();
        //console.log(Ecobankusers.Merchantsid);
        //console.log(Ecobankusers.Privilege);
        //cb(null);
        backendModel.searchAroundByType(location, types, radius, p, function(err, response, cxt){
            if (err) {
                console.log("Search error");
                throw err; //error making request
            }
            if (response.error) {
                next('> response error: ' + response.error.stack);
            }
            console.log("search for page: " + p );
            if(response.status == "1" && response.count != "0"){
                pageall = Math.ceil(parseFloat(response.count) / 20);
                // poiall.push.apply(poiall, response.pois);
                // progresspage++;
                var pages = new Array();
                for(pagenum = 1; pagenum <= pageall; pagenum++){
                    p = pagenum.toString();
                    pages.push(p);
                }
                pages.forEach(function(page){
                    backendModel.searchAroundByType(location, types, radius, page, function(err, response, cxt) {
                        console.log("search for page: " + page );
                        if (err) {
                            console.log("Search error");
                            throw err; //error making request
                        }
                        if (response.error) {
                            next('> response error: ' + response.error.stack);
                        }

                        poiall.push.apply(poiall, response.pois);
                        progresspage++;
                        console.log(response.count + "and" + poiall.length);
                        if(progresspage == pageall){
                            console.log("Merchant search success" + poiall.length);
                            poiall.forEach(function(poi){
                                var poiid = poi.id;
                                //console.log(poi);
                                //var m = Merchantsid.indexOf(poiid);
                                //if(m != -1){
                                if(Ecobankusers.MerchantsP.has(poiid)){
                                    console.log("find privilege " + poiid);
                                    //console.log(privilege.QPRIVIL1OperationResponse.lowest_amount_paid.bank_amout_paid);
                                    var merchant = {
                                        "MerchantBase": poi,
                                        "Privilege": Ecobankusers.MerchantsP.get(poiid)
                                    };
                                    //console.log(merchant);
                                    Merchant.push(merchant);
                                    console.log("Add " + Merchant.length + "progress: " + progress);
                                }
                                progress ++;
                                console.log("Merchant.length: " + Merchant.length + "progress: " + progress);
                                if(progress == poiall.length){
                                    Merchant.sort(function(m1, m2){
                                        //console.log("sort " + m1.MerchantBase.id + " and " + m2.MerchantBase.id);
                                        return parseFloat(m1.MerchantBase.distance) >= parseFloat(m2.MerchantBase.distance);
                                    });
                                    cb(null, Merchant);
                                }
                            });
                        }
                    });
                });
            }
            else {
                cb(null, "No merchant arround" + poif.status);
            }
        });
    }

    Ecobankusers.searchMerchantAroundByKeyword = function(location, keyword, radius, cb){
        var backendModel = app.models.Backend;
        var pageall = 0;
        var pagenum = 1;
        var poiall = new Array();
        var progresspage = 0;
        var progress = 0;
        var Merchant = Array();
        var p = pagenum.toString();
        //console.log(Ecobankusers.Merchantsid);
        //console.log(Ecobankusers.Privilege);
        //cb(null);
        backendModel.searchAroundByKeyword(location, keyword, radius, p, function(err, response, cxt){
            if (err) {
                console.log("Search error");
                throw err; //error making request
            }
            if (response.error) {
                next('> response error: ' + response.error.stack);
            }
            console.log("search for page: " + p );
            if(response.status == "1" && response.count != "0"){
                pageall = Math.ceil(parseFloat(response.count) / 20);
                // poiall.push.apply(poiall, response.pois);
                // progresspage++;
                var pages = new Array();
                for(pagenum = 1; pagenum <= pageall; pagenum++){
                    p = pagenum.toString();
                    pages.push(p);
                }
                pages.forEach(function(page){
                    backendModel.searchAroundByKeyword(location, keyword, radius, page, function(err, response, cxt) {
                        console.log("search for page: " + page );
                        if (err) {
                            console.log("Search error");
                            throw err; //error making request
                        }
                        if (response.error) {
                            next('> response error: ' + response.error.stack);
                        }

                        poiall.push.apply(poiall, response.pois);
                        progresspage++;
                        console.log(response.count + "and" + poiall.length);
                        if(progresspage == pageall){
                            console.log("Merchant search success" + poiall.length);
                            poiall.forEach(function(poi){
                                var poiid = poi.id;
                                //console.log(poi);
                                //var m = Merchantsid.indexOf(poiid);
                                //if(m != -1){
                                if(Ecobankusers.MerchantsP.has(poiid)){
                                    console.log("find privilege " + poiid);
                                    //console.log(privilege.QPRIVIL1OperationResponse.lowest_amount_paid.bank_amout_paid);
                                    var merchant = {
                                        "MerchantBase": poi,
                                        "Privilege": Ecobankusers.MerchantsP.get(poiid)
                                    };
                                    //console.log(merchant);
                                    Merchant.push(merchant);
                                    console.log("Add " + Merchant.length + "progress: " + progress);
                                }
                                progress ++;
                                console.log("Merchant.length: " + Merchant.length + "progress: " + progress);
                                if(progress == poiall.length){
                                    Merchant.sort(function(m1, m2){
                                        //console.log("sort " + m1.MerchantBase.id + " and " + m2.MerchantBase.id);
                                        return parseFloat(m1.MerchantBase.distance) >= parseFloat(m2.MerchantBase.distance);
                                    });
                                    cb(null, Merchant);
                                }
                            });
                        }
                    });
                });
            }
            else {
                cb(null, "No merchant arround" + poif.status);
            }
        });
    }

    Ecobankusers.remoteMethod('searchMerchantAroundByType', {
        accepts: [{
            arg: "location",
            type: "string",
            required: true
        },{
            arg: "types",
            type: "string",
            required: true
        },{
            arg: "radius",
            type: "string",
            required: true
        }],
        http: {
            path: '/MerchantAroundByType',
            verb: 'get',
            status: 200
        },
        returns: {
            arg: 'Merchants',
            type: 'string'
        }
    });

    Ecobankusers.remoteMethod('searchMerchantAroundByKeyword', {
        accepts: [{
            arg: "location",
            type: "string",
            required: true
        },{
            arg: "keyword",
            type: "string",
            required: true
        },{
            arg: "radius",
            type: "string",
            required: true
        }],
        http: {
            path: '/MerchantAroundByKeyword',
            verb: 'get',
            status: 200
        },
        returns: {
            arg: 'Merchants',
            type: 'string'
        }
    });

    Ecobankusers.remoteMethod('searchothershistory', {
        accepts: [],
        http: {
            path: '/cards/otherscards',
            verb: 'get',
            status: 200
        },
        returns: {
            arg: 'cards',
            type: 'string'
        }
    });



  Ecobankusers.remoteMethod('singleBalance', {
    accepts: [{
      arg: "id",
      type: "string",
      required: true
    }, {
      arg: "fk",
      type: "string",
      required: true
    }],
    http: {
      path: '/cards/balance',
      verb: 'get',
      status: 200
    },
    returns: {
      arg: 'balance',
      type: 'object'
    }
  });

  Ecobankusers.remoteMethod('singleHistory', {
    accepts: [{
      arg: "id",
      type: "string",
      required: true
    }, {
      arg: "fk",
      type: "string",
      required: true
    },{
      arg: "startdate",
      type: "string",
      required: true
    },{
      arg: "enddate",
      type: "string",
      required: true
    }],
    http: {
      path: '/cards/history',
      verb: 'get',
      status: 200
    },
    returns: {
      arg: 'history',
      type: 'string'
    }
  });

  Ecobankusers.remoteMethod('singleStatistics', {
    accepts: [{
      arg: "id",
      type: "string",
      required: true
    }, {
      arg: "fk",
      type: "string",
      required: true
    }, {
      arg: "bymonth",
      type: "boolean",
      required: true
    }, {
      arg: "startdate",
      type: "string",
      required: true
    },{
      arg: "enddate",
      type: "string"
    }],
    http: {
      path: '/cards/statistics',
      verb: 'get',
      status: 200
    },
    returns: {
      arg: 'data',
      type: 'string'
    }
  });

  Ecobankusers.remoteMethod('balance', {
    accepts: [{
      arg: "id",
      type: "string",
      required: true
    }],
    http: {
      path: '/balance',
      verb: 'get',
      status: 200
    },
    returns: {
      arg: 'balance',
      type: 'string'
    }
  });

  Ecobankusers.remoteMethod('history', {
    accepts: [{
      arg: "id",
      type: "string",
      required: true
    },{
      arg: "startdate",
      type: "string",
      required: true
    },{
      arg: "enddate",
      type: "string",
      required: true
    }],
    http: {
      path: '/history',
      verb: 'get',
      status: 200
    },
    returns: {
      arg: 'history',
      type: 'string'
    }
  });

  Ecobankusers.remoteMethod('statistics', {
    accepts: [{
      arg: "id",
      type: "string",
      required: true
    },{
      arg: "bymonth",
      type: "boolean",
      required: true
    },{
      arg: "startdate",
      type: "string",
      required: true
    }, {
      arg: "enddate",
      type: "string"
    }],
    http: {
      path: '/statistics',
      verb: 'get',
      status: 200
    },
    returns: {
      arg: 'data',
      type: 'string'
    }
  });

    Ecobankusers.remoteMethod('queryPaymentByUserd', {
        accepts: [{
            arg: "id",
            type: "string",
            required: true
        },{
            arg: "merchantid",
            type: "string",
            required: true
        },{
            arg: "merchantname",
            type: "string",
            required: true
        },{
            arg: "money",
            type: "string",
            required: true
        }],
        http: {
            path: '/payment',
            verb: 'get',
            status: 200
        },
        returns: {
            arg: 'data',
            type: 'string'
        }
    });

    Ecobankusers.remoteMethod('Pay', {
        accepts: [{
            arg: "id",
            type: "string",
            required: true
        },{
            arg: "fk",
            type: "string",
            required: true
        },{
            arg: "password",
            type: "string",
            required: true
        },{
            arg: "merchantname",
            type: "string",
            required: true
        },{
            arg: "buildingpoi",
            type: "string",
            required: true
        },{
            arg: "money",
            type: "string",
            required: true
        }],
        http: {
            path: '/pay',
            verb: 'get',
            status: 200
        },
        returns: {
            arg: 'data',
            type: 'string'
        }
    });




    /**
   * 从context中获取请求的card的card_num(id)
   * 首先从cache中查询，如果cache中没有，调用Cards的
   * findById方法，从数据源中查询，将查询结果存入cache
   * @param context express上下文信息

   function cacheSingleCardInfo(context) {
    //get cardnum from request's query
    var cardid = context.req.query.fk;
    var userid = context.req.query.id;
    var cachedCard = findCardByIdInCache(cardid, userid);

    console.log("cacheSingleCardInfo: cardid " + cardid);
    console.log("cacheSingleCardInfo: userid " + userid);

    var cardsModel = app.models.Cards;

    if(cachedCard == null) {

    }else {
      console.log("cacheCardInfo : instance is found in cache.");
    }
  }
   */

  /**
   * 从ZOS connect后台查询balance信息
   * 从cardInfo中获取card相关信息，不同的银行调用不同的
   * backend方法进行查询。
   * @param cardInfo 卡片对象
   * @returns {null} 返回包含卡片信息和balance的对象，若为空说明
   * 查询参数有误或出现错误。

   function queryCardBalanceInBackend(cardInfo) {
    var backendModel = app.models.Backend;

    if(cardInfo.bank == "Orange"){
      backendModel.queryBalanceOrange(cardInfo.card_num, function (err, response, cxt) {
        console.log("begin callback");
        if (err) throw err; //error making request
        if (response.error) {
          cxt.res.status(500).send("backend server error.");
        }
        var balanceObj = {
          card_num: cardInfo.card_num,
          bank: cardInfo.bank,
          asset: response.QBALANOROperationResponse.cust_balance.balance
        };
        console.log("begin callback " + balanceObj.asset);
        return balanceObj;
      });
    }else if(cacheCardInfo.bank == "Coconut"){
      backendModel.queryBalanceCoconut(cardInfo.card_num, function (err, response, cxt) {
        console.log("begin callback");
        if (err) throw err; //error making request
        if (response.error) {
          cxt.res.status(500).send("backend server error.");
        }
        var balanceObj = {
          card_num: cardInfo.card_num,
          bank: cardInfo.bank,
          asset: response.QBALANCOOperationResponse.cust_balance.balance
        };
        return balanceObj;
      });
    }else{

    }
  }
   */

  /**
   * 从ZOS connect后台查询history信息
   * 从cardInfo中获取card相关信息，不同的银行调用不同的
   * backend方法进行查询。
   * @param cardInfo 卡片对象
   * @returns {null} 返回包含卡片信息和balance的对象，若为空说明
   * 查询参数有误或出现错误。

   function queryCardHistoryInBackend(cardInfo, startDate, endDate){
    var backendModel = app.models.Backend;

    if(cardInfo.bank == "Orange"){
      backendModel.queryTrnHistOrange(cardInfo.card_num, startDate, endDate, function (err, response, cxt) {
        console.log("begin callback");
        if (err) throw err; //error making request
        if (response.error) {
          next('> response error: ' + response.error.stack);
        }
        return response.QTRNHIOROperationResponse.trans_history.trans_detail;
      });
    }else if(cardInfo.bank == "Coconut"){
      backendModel.queryTrnHistCoconut(cardInfo.card_num, startDate, endDate, function (err, response, cxt) {
        console.log("begin callback");
        if (err) throw err; //error making request
        if (response.error) {
          next('> response error: ' + response.error.stack);
        }
        console.log("queryCardHistoryInBackend : " + response.QTRNHICOOperationResponse.trans_history.trans_detail.length);
        return response.QTRNHICOOperationResponse.trans_history.trans_detail;
      });
    }else{
      return null;
    }
  }
   */


  /**
   * history方法钩函数
   * 在query history之前准备用户所有card信息

   Ecobankusers.beforeRemote("history", function (context, instance, next) {
    console.log("before remote history");
   // cacheCardsInfo(context);
    next();
  });
   */

};
