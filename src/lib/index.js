const EasyXml = require('easyxml')
const ws = require('ws.js-buffer-fix')
const Parser = require('xml2js-parser')
const parser = new Parser({ trim: true, explicitArray: false })
const serializer = new EasyXml({
  rootElement: 'soap:Envelope',
  indent: 0,
  unwrapArrays: true,
  filterNulls: true
})

module.exports = async options => {
  const { query, config, action } = options
  const dokumenter = options._dokumenter ? options._dokumenter : false
  const envelope = createEnvelope(query, action)
  const xml = jsToXml(envelope)
  try {
    const ctx = await sendRequest(xml, config.url, dokumenter)
    return xmlToJs(ctx)
  } catch (error) {
    throw checkError(error)
  }
}

const textInsideTag = (tag, html) => {
  const stripTag = new RegExp(`<${tag}>|</${tag}>`, 'g')
  const insideTag = new RegExp(`<${tag}>(.*?)</${tag}>`, 'g')
  const textInside = html.match(insideTag)
  return textInside ? textInside.join('').replace(stripTag, '') : ''
}

const checkError = error => {
  if (error.response && error.statusCode) {
    const tag = error.response.includes('title') ? 'title' : error.response.includes('faultstring') ? 'faultstring' : false
    return {
      message: tag ? textInsideTag(tag, error.response) : error.response,
      status: error.statusCode
    }
  } else {
    return error
  }
}

const createEnvelope = (query, action) => (
  {
    '_xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/',
    'soap:Body': {
      [`ns2:${action}`]: {
        '_xmlns:ns2': 'http://www.ks.no/svarut/servicesV9',
        ...query
      }
    }
  }
)

const jsToXml = obj => {
  let xml = serializer.render(obj)
  xml = xml.replace(/\n/g, '')
  return xml
}

const sendRequest = (xml, url, dokumenter) => {
  const addFiles = (wsRequest, dokumenter) => {
    dokumenter.map((dokument, i) => {
      const xpath = `//data[${++i}]`
      ws.addAttachment(wsRequest, 'request', xpath, dokument.data, dokument.mimetype)
    })
  }

  return new Promise((resolve, reject) => {
    const handlers = [
      new ws.Http(),
      new ws.Mtom()
    ]

    const wsRequest = {
      request: xml,
      url: url,
      contentType: 'application/soap+xml'
    }

    if (dokumenter) {
      addFiles(wsRequest, dokumenter)
    }

    ws.send(handlers, wsRequest, ctx => {
      ctx.statusCode === 200 ? resolve(ctx.response) : reject(ctx)
    })
  })
}

const xmlToJs = ctx => {
  try {
    const xml = textInsideTag('return', ctx)
    if (!xml) {
      return true
    } else {
      try {
        const obj = parser.parseStringSync(`<body>${xml}</body>`)
        const result = obj.body
        return result
      } catch (error) {
        console.error(error)
        throw error
      }
    }
  } catch (error) {
    console.error(error)
    throw error
  }
}
