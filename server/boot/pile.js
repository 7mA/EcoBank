'use strict';

module.exports = function(app) {
  /*
   * The `app` object provides access to a variety of LoopBack resources such as
   * models (e.g. `app.models.YourModelName`) or data sources (e.g.
   * `app.datasources.YourDataSource`). See
   * http://docs.strongloop.com/display/public/LB/Working+with+LoopBack+objects
   * for more info.
   */
  var productModel = app.models.Products;
  // productModel.cachedProducts = {
  //   product_list: [{"purchase_entry":"10,000.00","earning_rate":"1.50%","risk_type":"RISK-PR1","product_id":"BLC001","hold_time":"N/A","product_name":"RIRIYING"},{"purchase_entry":"100,000.00","earning_rate":"2.03%","risk_type":"RISK-PR2","product_id":"BLC002","hold_time":"180","product_name":"WENJIANLICAI"},{"purchase_entry":"500,000.00","earning_rate":"5.60%","risk_type":"RISK-PR3","product_id":"BLC003","hold_time":"360","product_name":"ANXINZHAIQUAN"},{"purchase_entry":"1,000,000.00","earning_rate":"6.10%","risk_type":"RISK-PR4","product_id":"BLC004","hold_time":"720","product_name":"CHENGZHANGXINTUO"},{"purchase_entry":"1,000,000.00","earning_rate":"7.40%","risk_type":"RISK-PR5","product_id":"BLC005","hold_time":"90","product_name":"JINQUJIJIN"}]
  // }
  console.log("boot script: Product cache loaded");

  var backendModel = app.models.Backend;
  var cardModel = app.models.Cards;
    var ecobankusersModel = app.models.EcoBankUsers;
    backendModel.queryAllPrivilege(function(err, response){
        if (err) {
            console.log("Search error");
            throw err; //error making request
        }
        if (response.error) {
            next('> response error: ' + response.error.stack);
        }
        var pri = response.QPRIVIL2OperationResponse.all_privil_detail.a_privil_detail;
        pri.sort(function(p1, p2){
            //console.log("sort " + m1.MerchantBase.id + " and " + m2.MerchantBase.id);
            return p1.merchantid_o <= p2.merchantid_o;
        });
        ecobankusersModel.Merchantsid = new Array();
        ecobankusersModel.Privilege = new Array();
        ecobankusersModel.MerchantsP = new Map();
        var preM = pri[0].merchantid_o;
        ecobankusersModel.Merchantsid.push(preM);
        var Pri = new Array();
        for(var i = 0; i < pri.length; i++){
            if (preM == pri[i].merchantid_o){
                var p = {
                    "bankid": pri[i].bankid,
                    "privilegetype_o": pri[i].privilegetype_o,
                    "detail1_o": pri[i].detail1_o,
                    "detail2_o": pri[i].detail2_o,
                    "detail3_o": pri[i].detail3_o,
                    "bankname": pri[i].bankname
                };
                Pri.push(p);
            }
            else{
                ecobankusersModel.Privilege.push(Pri);
                ecobankusersModel.Merchantsid.push(preM);
                ecobankusersModel.MerchantsP.set(preM, Pri);
                Pri = new Array();
                preM = pri[i].merchantid_o;
                var p = {
                    "bankid": pri[i].bankid,
                    "privilegetype_o": pri[i].privilegetype_o,
                    "detail1_o": pri[i].detail1_o,
                    "detail2_o": pri[i].detail2_o,
                    "detail3_o": pri[i].detail3_o,
                    "bankname": pri[i].bankname
                };
                Pri.push(p);
            }
            if(i == pri.length - 1){
                ecobankusersModel.Privilege.push(Pri);
                ecobankusersModel.MerchantsP.set(preM, Pri);
                console.log("Privilege cached already!");
                //console.log(ecobankusersModel.Merchantsid);
                //console.log(ecobankusersModel.Privilege);
                //console.log(ecobankusersModel.MerchantsP.has(ecobankusersModel.MerchantsP[1]));
            }
        }

    });

	var rule = new schedule.RecurrenceRule();

　　rule.dayOfWeek = [0, new schedule.Range(1, 6)];

　　rule.hour = 0;

　　rule.minute = 0;

　　var j = schedule.scheduleJob(rule, function(){

　　　　console.log("执行任务");

　　});


    cardModel.find(function(error, cards){
      var allhistory = new Array();
      var historydata = "";
      var fs = require('fs');
      fs.writeFile('history.csv', historydata, function (err) {
          if (err) {
              console.log(err);
          }
          else {
              console.log("historydata" + historydata);
          }
      });
      cards.forEach(function(card){
          var userid = card.userid;
          console.log("query card: " + userid);
          var start = "00000101";
          var end = "99991231";
          var history = new Array();
          if (card.bank == "Orange") {
                backendModel.queryTrnHistOrange(card.card_num, start, end, function (err, response, cxt) {
                    console.log("begin callback read history " + card.card_num);
                    if (err) throw err; //error making request
                    if (response.error) {
                        next('> response error: ' + response.error.stack);
                    }
                    history = response.QTRNHIO1OperationResponse.trans_history.trans_detail;
                    allhistory = allhistory.concat(history);
                    //console.log("history length" + history.length);
                    history.forEach(function(his){
                        var merchant_id = his.merchant_id;
                        var data = userid + ",1.0," + merchant_id + " \r";
                        //console.log("history data " + data);
                        fs.appendFile('history.csv', data, function (err) {
                            if (err) {
                                console.log(err);
                            }
                            else {
                                console.log("writedata" + data);
                            }
                        });
                    });
                });
            }
            else if (card.bank == "Coconut") {
                backendModel.queryTrnHistCoconut(card.card_num, start, end, function (err, response, cxt) {
                    console.log("begin callback read history " + card.card_num);
                    if (err) throw err; //error making request
                    if (response.error) {
                        next('> response error: ' + response.error.stack);
                    }
                    console.log("queryCardHistoryInBackend : " + response.QTRNHIC1OperationResponse.trans_history.trans_detail.length);

                    history = response.QTRNHIC1OperationResponse.trans_history.trans_detail;
                    allhistory = allhistory.concat(history);
                    console.log("history length" + history.length);
                    history.forEach(function(his){
                        var merchant_id = his.merchant_id;
                        var data = userid + ",1.0," + merchant_id + " \r";
                        //console.log("history data " + data);
                        fs.appendFile('history.csv', data, function (err) {
                            if (err) {
                                console.log(err);
                            }
                            else {
                                console.log("writedata" + data);
                            }
                        });
                    });
                });
            }
            console.log("one card end " + historydata);
      });
      // console.log("begin write hisdata " + historydata);
      // var fs = require('fs');
      // fs.writeFile('history.csv', historydata, function (err) {
      //   console.log("historydata" + historydata);
      //   if (err) {
      //         console.log(err);
      //   }
      //   else {
      //         console.log("historydata" + historydata);
      //     }
      // });
  });
};
