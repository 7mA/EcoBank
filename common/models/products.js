'use strict';

module.exports = function(Products) {
  var app = require('../../server/server');

  Products.cachedProducts = null;

  /**
   * 获取所有产品信息
   * 使用Backend模块的getAllProducts方法，访问server数据
   * 并将数据缓存于cache中
   * @param cb callback
   */
  Products.getAllProducts = function (cb) {
    console.log("before find a new product.");
    if(Products.cachedProducts == null){
      var backendModel = app.models.Backend;
      var product_id = "999999";
      backendModel.getAllProducts(product_id,function (err, response, cxt) {
        console.log("begin callback");
        if (err) throw err; //error making request
        if (response.error) {
          next('> response error: ' + response.error.stack);
        }
        Products.cachedProducts = {
          "product_list": response.QFINANCEOperationResponse.ffinance_record.record_detail
        };

        cb(null, Products.cachedProducts);
      });
    }else{
      cb(null, Products.cachedProducts);
    }
  };

  /**
   * 从缓存中获取指定的产品信息
   * 如果没有找到，则返回null
   * @param id 产品id
   * @returns {*}
   */
  function findProductInCache(id) {
    for(var i = 0; i < Products.cachedProducts.product_list.length; i ++){
      if(Products.cachedProducts.product_list[i].product_id == id){
        return Products.cachedProducts.product_list[i];
      }
    }
    return null;
  }

  /**
   * getProductById钩函数
   * 检查缓存是否为空，如果为空，则从后台请求数据。
   */
  Products.beforeRemote('getProductById', function (context, user , next) {
    console.log("before find a new product.");
    if(Products.cachedProducts == null){
      var backendModel = app.models.Backend;
        var product_id = "999999";
        backendModel.getAllProducts(product_id,function (err, response, cxt) {
        console.log("begin callback");
        if (err) throw err; //error making request
        if (response.error) {
          next('> response error: ' + response.error.stack);
        }
        Products.cachedProducts = {
          "product_list": response.QFINANCEOperationResponse.ffinance_record.record_detail
        };

        next();
      });
    }
  });

  /**
   * 查询指定产品的详细信息
   * 从缓存中按照id查找是否存在指定产品
   * 返回产品instance
   * @param id 查询产品id
   * @param cb callback
   */
  Products.getProductById = function (id, cb) {
    var product = findProductInCache(id);
    if(product == null){
      //todo: send response with error status
      cb(null, null);
    }else{
      cb(null, product);
    }
  }

  /**
   * getProductById钩函数
   * 检查缓存是否为空，如果为空，则从后台请求数据。
   */
  Products.beforeRemote('isProductExists', function (context, user , next) {
    console.log("before find a new product.");
    if(Products.cachedProducts == null){
      var backendModel = app.models.Backend;
        var product_id = "999999";
        backendModel.getAllProducts(product_id,function (err, response, cxt)  {
        console.log("begin callback");
        if (err) throw err; //error making request
        if (response.error) {
          next('> response error: ' + response.error.stack);
        }
        Products.cachedProducts = {
          "product_list": response.QFINANCEOperationResponse.ffinance_record.record_detail
        };

        next();
      });
    }
  });

  /**
   * 查询指定产品的详细信息
   * 从缓存中按照id查找是否存在指定产品
   * 返回bool
   * @param id 查询产品id
   * @param cb callback
   */
  Products.isProductExists = function(id, cb){
    var product = findProductInCache(id);
    if(product == null){
      cb(null, false);
    }else {
      cb(null, true);
    }
  }

  Products.remoteMethod("getAllProducts", {
    http: {
      path: '/all',
      verb: 'get'
    },
    returns: {
      arg: 'products',
      type: 'string'
    }
  });

  Products.remoteMethod("getProductById", {
    http: {
      path: "/detail",
      verb: "get"
    },
    returns: {
      arg: "product",
      type: "string"
    },
    accepts: [{
      arg: "id",
      type: "string",
      required: true
    }]
  });

  Products.remoteMethod("isProductExists", {
    http: {
      path: "/exists",
      verb: "get",
      status: 200
    },
    returns: {
      arg: "exist",
      type: "bool"
    },
    accepts: [{
      arg: "id",
      type: "string",
      required: true
    }]
  });
};
