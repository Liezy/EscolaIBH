import warning from 'lucide-static/icons/triangle-alert.svg?raw'

interface Confirmation {
  title: string
  description: string
  label: string
}

let dialog: HTMLDialogElement | undefined

export function dismissConfirmation() {
  if (dialog?.open) dialog.close('back')
}

export function confirmAction({title,description,label}: Confirmation) {
  if (dialog?.open) return Promise.resolve(false)

  const current = document.createElement('dialog')
  current.className='confirmation'
  current.setAttribute('aria-labelledby','confirmation-title')
  current.setAttribute('aria-describedby','confirmation-description')
  current.innerHTML=`<form method="dialog" class="confirmation-panel">
    <span class="confirmation-icon" aria-hidden="true">${warning}</span>
    <h2 id="confirmation-title"></h2>
    <p id="confirmation-description"></p>
    <div class="confirmation-actions">
      <button class="btn btn-outline" value="back" autofocus>Voltar</button>
      <button class="btn btn-error" value="confirm"></button>
    </div>
  </form>`
  current.querySelector('#confirmation-title')!.textContent=title
  current.querySelector('#confirmation-description')!.textContent=description
  current.querySelector('[value="confirm"]')!.textContent=label
  current.addEventListener('click',event=>{
    if (event.target===current) current.close('back')
  })
  dialog=current
  document.body.append(current)

  return new Promise<boolean>(resolve=>{
    current.addEventListener('close',()=>{
      current.remove()
      if (dialog===current) dialog=undefined
      resolve(current.returnValue==='confirm')
    },{once:true})
    current.showModal()
  })
}

